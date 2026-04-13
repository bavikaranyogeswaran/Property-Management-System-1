import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LandingPage } from '../pages/LandingPage';

/**
 * Wrapper for Landing Page to handle navigation callbacks.
 */
export function LandingPageWrapper() {
  const navigate = useNavigate();
  return (
    <LandingPage
      onNavigate={(page) => navigate(page === 'login' ? '/login' : `/${page}`)}
    />
  );
}

/**
 * Common layout for public-facing property pages (Browse, Details).
 * Adds the shared navigation header.
 */
export function PublicPropertiesWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex justify-between items-center mb-6">
        <div
          onClick={() => navigate('/')}
          className="font-bold text-xl cursor-pointer flex items-center gap-2"
        >
          <span className="text-blue-600">PMS</span>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => navigate('/')}
            className="text-gray-600 hover:text-blue-600"
          >
            Home
          </button>
          <button
            onClick={() => navigate('/login')}
            className="text-blue-600 font-medium"
          >
            Login
          </button>
        </div>
      </nav>
      <div className="container mx-auto px-6 pb-12">{children}</div>
    </div>
  );
}
