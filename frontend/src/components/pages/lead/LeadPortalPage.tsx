import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Send,
  Building2,
  MapPin,
  Calendar,
  AlertCircle,
  LinkIcon,
  MessageSquare,
} from 'lucide-react';
import { API_BASE_URL } from '@/services/api';

// ============================================================================
//  LEAD PORTAL PAGE (Guest Access via Token Link)
// ============================================================================
//  This page is accessible WITHOUT login. The lead receives a unique link
//  via email after submitting interest. The link contains a token that
//  authenticates them for viewing their application and chatting with the owner.
// ============================================================================

interface LeadData {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'interested' | 'converted' | 'dropped';
  propertyId: string;
  interestedUnit?: string;
  createdAt: string;
}

interface PropertyData {
  name: string;
  street: string;
  city: string;
  district: string;
}

interface UnitData {
  unitNumber: string;
  type: string;
  monthlyRent: number;
}

interface PortalData {
  lead: LeadData;
  property: PropertyData | null;
  unit: UnitData | null;
}

interface ChatMessage {
  id: number;
  leadId: number;
  senderId: number;
  senderName?: string;
  senderRole?: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

// Create a separate axios instance for portal (no JWT interceptor)
function portalApi(token: string) {
  return {
    getPortalData: () =>
      axios.get(`${API_BASE_URL}/lead-portal`, { params: { token } }),
    getMessages: () =>
      axios.get(`${API_BASE_URL}/lead-portal/messages`, { params: { token } }),
    sendMessage: (content: string) =>
      axios.post(
        `${API_BASE_URL}/lead-portal/messages`,
        { content },
        { params: { token } }
      ),
  };
}

export function LeadPortalPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load portal data
  useEffect(() => {
    if (!token) {
      setError('No access token provided. Please use the link from your email.');
      setLoading(false);
      return;
    }

    const api = portalApi(token);

    const loadData = async () => {
      try {
        const [portalRes, messagesRes] = await Promise.all([
          api.getPortalData(),
          api.getMessages(),
        ]);
        setPortalData(portalRes.data);
        setMessages(messagesRes.data);
      } catch (err: any) {
        const msg =
          err.response?.data?.error ||
          'Failed to load your application. The link may be invalid or expired.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token]);

  // Poll for new messages every 5 seconds
  useEffect(() => {
    if (!token || error || !portalData) return;

    const api = portalApi(token);
    const interval = setInterval(async () => {
      try {
        const res = await api.getMessages();
        setMessages(res.data);
      } catch {
        // Silently fail on poll errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [token, error, portalData]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !token || sending) return;

    setSending(true);
    try {
      const api = portalApi(token);
      const res = await api.sendMessage(newMessage.trim());
      setMessages((prev) => [...prev, res.data]);
      setNewMessage('');
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to send message';
      alert(msg);
    } finally {
      setSending(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; color: string }> = {
      interested: { label: 'Interested', color: 'bg-blue-100 text-blue-700' },
      converted: {
        label: 'Converted to Tenant',
        color: 'bg-green-100 text-green-700',
      },
      dropped: { label: 'Closed', color: 'bg-gray-100 text-gray-700' },
    };
    const variant = variants[status] || variants['interested'];
    return (
      <Badge variant="outline" className={`${variant.color} border-0`}>
        {variant.label}
      </Badge>
    );
  };

  // Error State
  if (!loading && error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="mx-auto size-12 text-red-500" />
            <h2 className="text-xl font-semibold text-gray-900">
              Access Denied
            </h2>
            <p className="text-gray-600">{error}</p>
            <p className="text-sm text-gray-400">
              If you believe this is a mistake, please contact the property owner
              for a new access link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading State
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Loader2 className="mx-auto size-8 animate-spin text-blue-600" />
          <p className="text-gray-500">Loading your application...</p>
        </div>
      </div>
    );
  }

  if (!portalData) return null;

  const { lead, property, unit } = portalData;
  const isDropped = lead.status === 'dropped';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Your Application
          </h1>
          <p className="text-gray-500 mt-1">Hello, {lead.name}</p>
        </div>
        {getStatusBadge(lead.status)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Details */}
        <div className="lg:col-span-1 space-y-6">
          {/* Property Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="size-5 text-blue-600" />
                Property Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {property ? (
                <div>
                  <h3 className="font-semibold text-lg">{property.name}</h3>
                  <p className="text-gray-600 flex items-center gap-1 mt-1">
                    <MapPin className="size-4" />
                    {[property.street, property.city, property.district]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
              ) : (
                <p className="text-gray-500 italic">
                  Property details unavailable
                </p>
              )}

              <Separator />

              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">
                  Unit of Interest
                </p>
                <p className="font-medium text-gray-900">
                  {unit
                    ? `Unit ${unit.unitNumber} (${unit.type})`
                    : 'General Inquiry'}
                </p>
                {unit && (
                  <p className="text-sm text-blue-600 font-semibold mt-1">
                    LKR{' '}
                    {Number(unit.monthlyRent).toLocaleString('en-LK')}/month
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <Calendar className="size-3" />
                  Submitted On
                </p>
                <p className="font-medium text-gray-900">
                  {new Date(lead.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Contact Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Contact Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Email:</span> {lead.email}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-medium">Phone:</span>{' '}
                {lead.phone || 'Not provided'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Chat */}
        <div className="lg:col-span-2">
          <Card className="flex flex-col h-[600px]">
            <CardHeader className="border-b px-4 py-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <MessageSquare className="size-4" />
                Chat with Property Owner
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
              {/* Messages area */}
              <div className="flex-1 p-4 overflow-y-auto" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <div className="text-center text-gray-500 py-10 text-sm">
                      <MessageSquare className="mx-auto size-8 text-gray-300 mb-3" />
                      <p>No messages yet.</p>
                      <p className="mt-1">
                        Send a message to start the conversation!
                      </p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe =
                        msg.senderRole === 'lead' &&
                        String(msg.senderId) !== '0';
                      // Messages from owner will have senderRole 'owner'
                      const isOwner = msg.senderRole === 'owner';

                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isOwner ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg p-3 ${
                              isOwner
                                ? 'bg-gray-100 text-gray-900'
                                : 'bg-blue-600 text-white'
                            }`}
                          >
                            {isOwner && (
                              <p className="text-xs font-semibold mb-1 opacity-70">
                                Property Owner
                              </p>
                            )}
                            <p className="text-sm whitespace-pre-wrap">
                              {msg.content}
                            </p>
                            <p
                              className={`text-[10px] mt-1 text-right ${isOwner ? 'text-gray-500' : 'text-blue-100'}`}
                            >
                              {new Date(msg.createdAt).toLocaleTimeString(
                                'en-US',
                                {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  timeZone: 'Asia/Colombo',
                                }
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Input area */}
              {isDropped ? (
                <div className="p-4 border-t bg-gray-50 text-center">
                  <p className="text-sm text-gray-500">
                    This inquiry has been closed. You cannot send messages.
                  </p>
                </div>
              ) : (
                <div className="p-4 border-t bg-gray-50">
                  <form
                    onSubmit={handleSendMessage}
                    className="flex gap-2"
                  >
                    <Textarea
                      placeholder="Type your message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      className="min-h-[50px] resize-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(e);
                        }
                      }}
                    />
                    <Button
                      type="submit"
                      disabled={sending || !newMessage.trim()}
                      className="h-auto"
                    >
                      <Send className="size-4" />
                    </Button>
                  </form>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
