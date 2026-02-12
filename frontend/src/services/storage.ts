// LocalStorage helper utilities

export const storage = {
  // Auth token management
  getToken: (): string | null => {
    return localStorage.getItem('authToken');
  },

  setToken: (token: string): void => {
    localStorage.setItem('authToken', token);
  },

  removeToken: (): void => {
    localStorage.removeItem('authToken');
  },

  // User data management
  getUser: (): any | null => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  setUser: (user: any): void => {
    localStorage.setItem('user', JSON.stringify(user));
  },

  removeUser: (): void => {
    localStorage.removeItem('user');
  },

  // Clear all storage
  clear: (): void => {
    localStorage.clear();
  },
};

export default storage;
