// API configuration and axios instance
// This will be used for making HTTP requests to the backend

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Placeholder for axios instance
// When backend is ready, uncomment and configure:
// import axios from 'axios';
// 
// export const apiClient = axios.create({
//   baseURL: API_BASE_URL,
//   headers: {
//     'Content-Type': 'application/json',
//   },
// });
// 
// // Add request interceptor to include auth token
// apiClient.interceptors.request.use(
//   (config) => {
//     const token = localStorage.getItem('authToken');
//     if (token) {
//       config.headers.Authorization = `Bearer ${token}`;
//     }
//     return config;
//   },
//   (error) => Promise.reject(error)
// );

export default {};
