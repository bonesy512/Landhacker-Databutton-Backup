import { create } from 'zustand';
import { FirecrawlPrice, PropertyDetailsResponse } from 'types';

export type JobStatus = 'queued' | 'fetching-prices' | 'predicting' | 'completed' | 'error';

export interface PriceJob {
  id: string;
  property: PropertyDetailsResponse;
  status: JobStatus;
  error?: string;
  priceEstimates?: FirecrawlPrice[];
  predictedPrice?: {
    predicted_price: string;
    confidence_score: string;
    reasoning: string;
  };
  createdAt: number;
}

interface QueueState {
  jobs: PriceJob[];
  maxJobs: number;
  isProcessing: boolean;
  // Actions
  addJob: (property: PropertyDetailsResponse) => Promise<void>;
  removeJob: (id: string) => void;
  updateJob: (id: string, updates: Partial<PriceJob>) => void;
  clearCompletedJobs: () => void;
  // Getters
  getJobById: (id: string) => PriceJob | undefined;
  getJobByProperty: (property: PropertyDetailsResponse) => PriceJob | undefined;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  jobs: [],
  maxJobs: 3,
  isProcessing: false,

  addJob: async (property) => {
    const state = get();
    
    // Check if property is already in queue
    const existingJob = state.getJobByProperty(property);
    if (existingJob) return;

    // Check if queue is full
    if (state.jobs.length >= state.maxJobs) {
      throw new Error('Queue is full. Please wait for current jobs to complete.');
    }

    // Add new job
    const newJob: PriceJob = {
      id: Math.random().toString(36).substring(7),
      property,
      status: 'queued',
      createdAt: Date.now()
    };

    set(state => ({
      jobs: [...state.jobs, newJob]
    }));
  },

  removeJob: (id) => {
    set(state => ({
      jobs: state.jobs.filter(job => job.id !== id)
    }));
  },

  updateJob: (id, updates) => {
    set(state => ({
      jobs: state.jobs.map(job =>
        job.id === id ? { ...job, ...updates } : job
      )
    }));
  },

  clearCompletedJobs: () => {
    set(state => ({
      jobs: state.jobs.filter(job =>
        job.status !== 'completed' && job.status !== 'error'
      )
    }));
  },

  getJobById: (id) => {
    return get().jobs.find(job => job.id === id);
  },

  getJobByProperty: (property) => {
    return get().jobs.find(job => 
      job.property.address?.streetAddress === property.address?.streetAddress &&
      job.property.address?.city === property.address?.city &&
      job.property.address?.state === property.address?.state
    );
  }
}));
