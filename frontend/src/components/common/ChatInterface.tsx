import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Send, User, Building2 } from 'lucide-react';
import { messageApi } from '@/services/api';
import { toast } from 'sonner';
import { useAuth } from '@/app/context/AuthContext';

interface Message {
  id: number;
  leadId: number;
  senderId: number;
  content: string;
  isRead: boolean;
  createdAt: string;
  senderName?: string;
  senderRole?: string; // 'owner' | 'lead' | 'tenant'
}

interface ChatInterfaceProps {
  leadId?: string | number;
  tenantId?: string | number;
  mode?: 'lead' | 'tenant' | 'tenant-admin';
  title?: string;
  readOnly?: boolean;
  className?: string;
}

export function ChatInterface({
  leadId,
  tenantId,
  mode = 'lead',
  title = 'Negotiation Chat',
  readOnly = false,
  className,
}: ChatInterfaceProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    try {
      let response;
      if (mode === 'tenant') {
        response = await messageApi.getMyThread();
      } else if (mode === 'tenant-admin') {
        if (!tenantId) return;
        response = await messageApi.getTenantMessages(String(tenantId));
      } else {
        if (!leadId) return;
        response = await messageApi.getLeadMessages(String(leadId));
      }
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to fetch messages', error);
    }
  };

  useEffect(() => {
    fetchMessages();
    // Poll for new messages every 5 seconds if not read-only
    if (!readOnly) {
      const interval = setInterval(fetchMessages, 5000);
      return () => clearInterval(interval);
    }
  }, [leadId, tenantId, mode, readOnly]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || readOnly) return;

    setIsLoading(true);
    try {
      let response;
      if (mode === 'tenant') {
        response = await messageApi.sendToOwner(newMessage);
      } else if (mode === 'tenant-admin') {
        if (!tenantId) return;
        response = await messageApi.sendTenantMessage(String(tenantId), newMessage);
      } else {
        if (!leadId) return;
        response = await messageApi.sendLeadMessage(String(leadId), newMessage);
      }

      setMessages([
        ...messages,
        { ...response.data, senderName: user?.name, senderRole: user?.role },
      ]);
      setNewMessage('');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={`flex flex-col ${className || 'h-[600px]'}`}>
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        <div className="flex-1 p-4 overflow-y-auto" ref={scrollRef}>
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-10 text-sm">
                No messages yet. Start the conversation!
              </div>
            ) : (
              messages.map((msg) => {
                const isMe =
                  msg.senderId === Number(user?.id) ||
                  (msg.senderRole === user?.role &&
                    msg.senderName === user?.name);
                // Note: comparison logic might need adjustment depending on how user.id is stored (string vs int)
                // Since user.id from AuthContext might be string and DB is int.
                const isSenderMe = String(msg.senderId) === String(user?.id);

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isSenderMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        isSenderMe
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      {!isSenderMe && (
                        <p className="text-xs font-semibold mb-1 opacity-70">
                          {msg.senderRole === 'owner'
                            ? 'Owner'
                            : msg.senderName || 'User'}
                        </p>
                      )}
                      <p className="text-sm whitespace-pre-wrap">
                        {msg.content}
                      </p>
                      <p
                        className={`text-[10px] mt-1 text-right ${isSenderMe ? 'text-blue-100' : 'text-gray-500'}`}
                      >
                        {new Date(msg.createdAt).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Asia/Colombo',
                        })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {!readOnly && (
          <div className="p-4 border-t bg-gray-50">
            <form onSubmit={handleSendMessage} className="flex gap-2">
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
                disabled={isLoading || !newMessage.trim()}
                className="h-auto"
              >
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
