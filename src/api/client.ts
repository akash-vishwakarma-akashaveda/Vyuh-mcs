import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Token-handler pattern (NFR-05): the session is an httpOnly cookie the BFF sets and
 * reads. No access or refresh token is ever held in JavaScript, so there is nothing
 * here to attach to a request — the cookie rides along instead.
 */
apiClient.defaults.withCredentials = true;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Attempt token refresh or logout
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);
