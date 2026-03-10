import React, { useRef } from 'react';
import { Button } from './ui/button';
import { Download, Printer, CheckCircle } from 'lucide-react';
import { Receipt } from '../context/AppContext';

interface ReceiptViewerProps {
  receipt: Receipt | null;
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  unitNumber: string;
  paymentMethod: string;
  paymentDate: string;
  onClose?: () => void;
}

export function ReceiptViewer({
  receipt,
  tenantName,
  tenantEmail,
  propertyName,
  unitNumber,
  paymentMethod,
  paymentDate,
  onClose,
}: ReceiptViewerProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!receipt) return null;

  const handleDownload = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = receiptRef.current?.innerHTML || '';
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt ${receipt.receiptNumber}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            .receipt-container {
              border: 2px solid #000;
              padding: 30px;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .header h1 {
              margin: 0;
              font-size: 32px;
              font-weight: bold;
            }
            .receipt-number {
              font-size: 18px;
              color: #666;
              margin-top: 10px;
            }
            .status-badge {
              display: inline-block;
              background-color: #10b981;
              color: white;
              padding: 8px 16px;
              border-radius: 6px;
              margin-top: 10px;
              font-weight: 600;
            }
            .section {
              margin-bottom: 30px;
            }
            .section-title {
              font-weight: 600;
              font-size: 14px;
              color: #666;
              text-transform: uppercase;
              margin-bottom: 10px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #e5e7eb;
            }
            .info-label {
              color: #666;
            }
            .info-value {
              font-weight: 600;
              text-align: right;
            }
            .amount-section {
              background-color: #f3f4f6;
              padding: 20px;
              border-radius: 8px;
              margin: 30px 0;
            }
            .total-amount {
              font-size: 36px;
              font-weight: bold;
              text-align: center;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 2px solid #000;
              text-align: center;
              color: #666;
              font-size: 12px;
            }
            @media print {
              body {
                padding: 0;
              }
              .no-print {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `);
    
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handlePrint = () => {
    handleDownload();
  };

  return (
    <div className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <span>Payment Receipt</span>
        <div className="flex gap-2">
          <Button onClick={handlePrint} variant="outline" size="sm">
            <Printer className="size-4 mr-2" />
            Print
          </Button>
          <Button onClick={handleDownload} size="sm">
            <Download className="size-4 mr-2" />
            Download
          </Button>
        </div>
      </div>

      <div ref={receiptRef} className="mt-4">
        <div className="border-2 border-gray-900 p-8">
          {/* Header */}
          <div className="text-center border-b-2 border-gray-900 pb-6 mb-8">
            <h1 className="text-3xl font-bold mb-2">PAYMENT RECEIPT</h1>
            <div className="text-lg text-gray-600 mb-3">{receipt.receiptNumber}</div>
            <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-lg font-semibold">
              <CheckCircle className="size-5" />
              PAID
            </div>
          </div>

          {/* Receipt Details */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <div className="text-xs font-semibold text-gray-600 uppercase mb-3">Receipt Information</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-gray-200 pb-2">
                  <span className="text-gray-600">Receipt Date:</span>
                  <span className="font-semibold text-right">{receipt.generatedDate}</span>
                </div>
                <div className="flex justify-between border-b border-gray-200 pb-2">
                  <span className="text-gray-600">Payment Date:</span>
                  <span className="font-semibold text-right">{paymentDate}</span>
                </div>
                <div className="flex justify-between border-b border-gray-200 pb-2">
                  <span className="text-gray-600">Payment Method:</span>
                  <span className="font-semibold text-right">{paymentMethod}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-600 uppercase mb-3">Tenant Information</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-gray-200 pb-2">
                  <span className="text-gray-600">Name:</span>
                  <span className="font-semibold text-right">{tenantName}</span>
                </div>
                <div className="flex justify-between border-b border-gray-200 pb-2">
                  <span className="text-gray-600">Email:</span>
                  <span className="font-semibold text-right">{tenantEmail}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Property Information */}
          <div className="mb-8">
            <div className="text-xs font-semibold text-gray-600 uppercase mb-3">Property Information</div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between border-b border-gray-200 pb-2">
                <span className="text-gray-600">Property:</span>
                <span className="font-semibold text-right">{propertyName}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-2">
                <span className="text-gray-600">Unit Number:</span>
                <span className="font-semibold text-right">{unitNumber}</span>
              </div>
            </div>
          </div>

          {/* Amount Section */}
          <div className="bg-gray-50 p-6 rounded-lg my-8">
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-2">Total Amount Paid</div>
              <div className="text-4xl font-bold">${receipt.amount.toLocaleString()}</div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t-2 border-gray-900 pt-6 mt-8 text-center text-gray-600 text-xs">
            <p className="mb-2">This is an official payment receipt.</p>
            <p>For any inquiries, please contact the property management office.</p>
            <p className="mt-4 font-semibold">Thank you for your payment!</p>
          </div>
        </div>
      </div>
    </div>
  );
}