import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Building2,
  CheckCircle,
  ArrowRight,
  Star,
  Users,
  Shield,
} from 'lucide-react';

// ============================================================================
//  LANDING PAGE (The Front Door)
// ============================================================================
//  This is the very first screen anyone sees when they visit the website.
//  It's like the "Welcome Mat". It shows what the company does and has a Login button.
// ============================================================================

export function LandingPage({
  onNavigate,
}: {
  // onNavigate: A special tool to switch screens (like a remote control)
  onNavigate: (page: string) => void;
}) {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Building2 className="text-white size-6" />
          </div>
          <span className="text-xl font-bold text-gray-900">PMS</span>
        </div>
        <div className="flex items-center gap-4">
          <Button onClick={() => onNavigate('login')}>Login</Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-16 md:py-24">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 leading-tight">
              Find Your Perfect{' '}
              <span className="text-blue-600">Dream Property</span>
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed">
              Experience modern living with our premium properties. Seamless
              leasing, transparent management, and a community you'll love.
            </p>
            <div className="flex gap-4">
              <Button
                size="lg"
                className="h-12 px-8 text-lg"
                onClick={() => onNavigate('browse-properties')}
              >
                Browse Properties <ArrowRight className="ml-2 size-5" />
              </Button>
            </div>
            <div className="flex items-center gap-6 pt-4 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <CheckCircle className="text-green-500 size-4" />
                <span>Verified Listings</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="text-green-500 size-4" />
                <span>24/7 Support</span>
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -z-10 top-0 right-0 w-3/4 h-full bg-blue-50 rounded-full blur-3xl opacity-50"></div>
            <img
              src="https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80"
              alt="Modern Building"
              className="rounded-2xl shadow-2xl transform hover:scale-[1.02] transition-transform duration-300"
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-gray-50 py-20">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Why Choose Us?
            </h2>
            <p className="text-gray-600">
              We provide a complete property management solution that makes
              renting easy and living comfortable.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Star,
                title: 'Premium Quality',
                desc: 'All our properties are inspected and maintained to the highest standards.',
              },
              {
                icon: Shield,
                title: 'Secure Leasing',
                desc: 'Transparent contracts and secure payment systems for your peace of mind.',
              },
              {
                icon: Users,
                title: 'Community Focused',
                desc: 'Join a vibrant community with events and dedicated support teams.',
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="bg-white p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="bg-blue-100 w-12 h-12 rounded-lg flex items-center justify-center mb-6">
                  <feature.icon className="text-blue-600 size-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8 mb-8 border-b border-gray-800 pb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="text-blue-400 size-6" />
                <span className="text-xl font-bold">PMS</span>
              </div>
              <p className="text-gray-400">
                Making property management simple and efficient for everyone.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <button
                    onClick={() => onNavigate('browse-properties')}
                    className="hover:text-blue-400"
                  >
                    Properties
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate('login')}
                    className="hover:text-blue-400"
                  >
                    Login
                  </button>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <p className="text-gray-400">
                34/3, Sabapathy Road
                <br />
                Jaffna, Sri Lanka
                <br />
                contact@pms.com
              </p>
            </div>
          </div>
          <div className="text-center text-gray-500 text-sm">
            © 2026 Property Management System. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
