// src/api/axiosInstance.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL;

const instance = axios.create({
  baseURL: `${API_URL}/api/`,
});

instance.interceptors.request.use(config => {
  const userData = JSON.parse(localStorage.getItem('userData'));
  if (userData?.token) {
    config.headers.Authorization = `Bearer ${userData.token}`;
  } else {
    delete config.headers.Authorization;
  }
  return config;
});

export default instance;
