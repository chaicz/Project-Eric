/**
 * API Service Configuration
 * 
 * Configure your XAMPP backend connection here.
 * 
 * For Development (XAMPP):
 *   VITE_API_URL = http://localhost/project-eric-api/api
 * 
 * For Production:
 *   Set your production API URL
 */

// API Base URL - Change this to your XAMPP backend URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost/project-eric-api/api';

// Endpoints
export const API_ENDPOINTS = {
  // Public endpoints
  LANDING: `${API_BASE_URL}/landing`,
  FEATURES: `${API_BASE_URL}/features`,
  TEAM: `${API_BASE_URL}/team`,
  INFO: `${API_BASE_URL}/info`,
  
  // Auth endpoints
  AUTH: {
    LOGIN: `${API_BASE_URL}/auth/login`,
    REGISTER: `${API_BASE_URL}/auth/register`,
    OAUTH: `${API_BASE_URL}/auth/oauth`,
    VALIDATE: `${API_BASE_URL}/auth/validate`,
    FORGOT_PASSWORD: `${API_BASE_URL}/auth/forgot-password`,
    RESET_PASSWORD: `${API_BASE_URL}/auth/reset-password`,
    LOGOUT: `${API_BASE_URL}/auth/logout`,
  }
};

// Helper function for API calls
export async function apiCall(endpoint, options = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  // Add auth token if available
  const token = localStorage.getItem('token');
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(endpoint, config);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Auth API functions
export const authAPI = {
  login: async (email, password) => {
    return apiCall(API_ENDPOINTS.AUTH.LOGIN, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  register: async (userData) => {
    return apiCall(API_ENDPOINTS.AUTH.REGISTER, {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  validate: async () => {
    return apiCall(API_ENDPOINTS.AUTH.VALIDATE);
  },

  oauth: async (provider, oauthData) => {
    return apiCall(API_ENDPOINTS.AUTH.OAUTH, {
      method: 'POST',
      body: JSON.stringify({ provider, ...oauthData }),
    });
  },

  forgotPassword: async (email) => {
    return apiCall(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  resetPassword: async (token, newPassword) => {
    return apiCall(API_ENDPOINTS.AUTH.RESET_PASSWORD, {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  },
};

// Public API functions
export const publicAPI = {
  getLandingData: async () => {
    return apiCall(API_ENDPOINTS.LANDING);
  },

  getFeatures: async () => {
    return apiCall(API_ENDPOINTS.FEATURES);
  },

  getTeam: async () => {
    return apiCall(API_ENDPOINTS.TEAM);
  },
};

export default {
  apiCall,
  authAPI,
  publicAPI,
  API_ENDPOINTS,
  API_BASE_URL,
};
