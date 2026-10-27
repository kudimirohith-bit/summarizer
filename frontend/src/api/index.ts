import axios, { AxiosResponse } from 'axios';
import { AuthResponse, Summary, SummaryListItem, ReviewDecision } from '../types';

const BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({ baseURL: BASE_URL });

// Attach JWT from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auth
export const authApi = {
  register: (name: string, email: string, password: string): Promise<AxiosResponse<AuthResponse>> =>
    api.post<AuthResponse>('/api/auth/register', { name, email, password }),
  login: (email: string, password: string): Promise<AxiosResponse<AuthResponse>> =>
    api.post<AuthResponse>('/api/auth/login', { email, password }),
};

// Summaries
export const summariesApi = {
  create: async (data: {
    title: string;
    text: string;
    model: string;
    tau: number;
    longMode: boolean;
  }): Promise<{ id: string; status: string }> => {
    const res = await api.post<{ id: string; status: string }>('/api/summaries', data);
    return res.data;
  },

  getById: async (id: string): Promise<Summary> => {
    const res = await api.get<Summary>(`/api/summaries/${id}`);
    return res.data;
  },

  list: async (): Promise<SummaryListItem[]> => {
    const res = await api.get<SummaryListItem[]>('/api/summaries');
    return res.data;
  },

  review: async (
    id: string,
    data: { decisions: ReviewDecision[]; approved?: boolean }
  ): Promise<Summary> => {
    // Send to backend review endpoint
    await api.post(`/api/summaries/${id}/review`, {
      sentences: data.decisions,
      approve: data.approved,
    });
    // Return updated summary
    const res = await api.get<Summary>(`/api/summaries/${id}`);
    return res.data;
  },
};

// Audit
export const auditApi = {
  list: async (): Promise<unknown[]> => {
    const res = await api.get<unknown[]>('/api/audit');
    return res.data;
  },
};

// Results
export const resultsApi = {
  get: async (): Promise<any> => {
    const res = await api.get<any>('/api/results');
    return res.data;
  },
};

export default api;
