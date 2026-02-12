import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Printer, CheckCircle } from 'lucide-react';
import { Receipt } from '@/app/context/AppContext';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface ReceiptViewerProps {
  receipt: Receipt | null;
  tenantName: string;
  tenantEmail: string;
  propertyName: string;
  unitNumber: string;
  paymentMethod: string;
  paymentDate: string;
  description: string;
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
  description,
  onClose,
}: ReceiptViewerProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!receipt) return null;

  const handleDownload = async () => {
    console.log('Download button clicked');
    if (!receiptRef.current) {
      console.error('Receipt ref is null');
      return;
    }

    try {
      console.log('Starting html2canvas capture...');
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2, // Improve quality
        logging: true, // Enable logging for html2canvas
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      console.log('Canvas captured successfully');

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`receipt-${receipt.receiptNumber}.pdf`);
      console.log('PDF saved');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(
        `Failed to generate PDF: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const handlePrint = () => {
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

      <div
        ref={receiptRef}
        className="mt-4 bg-white"
        style={{ color: '#000000' }}
      >
        <div className="border-2 p-8" style={{ borderColor: '#111827' }}>
          {/* Header */}
          <div
            className="text-center border-b-2 pb-6 mb-8"
            style={{ borderColor: '#111827' }}
          >
            <h1 className="text-3xl font-bold mb-2">PAYMENT RECEIPT</h1>
            <div className="text-lg mb-3" style={{ color: '#4b5563' }}>
              {receipt.receiptNumber}
            </div>
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold"
              style={{ backgroundColor: '#d1fae5', color: '#047857' }}
            >
              <CheckCircle className="size-5" />
              PAID
            </div>
          </div>

          {/* Receipt Details */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <div
                className="text-xs font-semibold uppercase mb-3"
                style={{ color: '#4b5563' }}
              >
                Receipt Information
              </div>
              <div className="space-y-2 text-sm">
                <div
                  className="flex justify-between border-b pb-2"
                  style={{ borderColor: '#e5e7eb' }}
                >
                  <span style={{ color: '#4b5563' }}>Receipt Date:</span>
                  <span className="font-semibold text-right">
                    {receipt.generatedDate}
                  </span>
                </div>
                <div
                  className="flex justify-between border-b pb-2"
                  style={{ borderColor: '#e5e7eb' }}
                >
                  <span style={{ color: '#4b5563' }}>Payment Date:</span>
                  <span className="font-semibold text-right">
                    {paymentDate}
                  </span>
                </div>
                <div
                  className="flex justify-between border-b pb-2"
                  style={{ borderColor: '#e5e7eb' }}
                >
                  <span style={{ color: '#4b5563' }}>Payment Method:</span>
                  <span className="font-semibold text-right">
                    {paymentMethod}
                  </span>
                </div>
                <div
                  className="flex justify-between border-b pb-2"
                  style={{ borderColor: '#e5e7eb' }}
                >
                  <span style={{ color: '#4b5563' }}>Payment For:</span>
                  <span className="font-semibold text-right">
                    {description}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div
                className="text-xs font-semibold uppercase mb-3"
                style={{ color: '#4b5563' }}
              >
                Tenant Information
              </div>
              <div className="space-y-2 text-sm">
                <div
                  className="flex justify-between border-b pb-2"
                  style={{ borderColor: '#e5e7eb' }}
                >
                  <span style={{ color: '#4b5563' }}>Name:</span>
                  <span className="font-semibold text-right">{tenantName}</span>
                </div>
                <div
                  className="flex justify-between border-b pb-2"
                  style={{ borderColor: '#e5e7eb' }}
                >
                  <span style={{ color: '#4b5563' }}>Email:</span>
                  <span className="font-semibold text-right">
                    {tenantEmail}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Property Information */}
          <div className="mb-8">
            <div
              className="text-xs font-semibold uppercase mb-3"
              style={{ color: '#4b5563' }}
            >
              Property Information
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div
                className="flex justify-between border-b pb-2"
                style={{ borderColor: '#e5e7eb' }}
              >
                <span style={{ color: '#4b5563' }}>Property:</span>
                <span className="font-semibold text-right">{propertyName}</span>
              </div>
              <div
                className="flex justify-between border-b pb-2"
                style={{ borderColor: '#e5e7eb' }}
              >
                <span style={{ color: '#4b5563' }}>Unit Number:</span>
                <span className="font-semibold text-right">{unitNumber}</span>
              </div>
            </div>
          </div>

          {/* Amount Section */}
          <div
            className="p-6 rounded-lg my-8"
            style={{ backgroundColor: '#f9fafb' }}
          >
            <div className="text-center">
              <div className="text-sm mb-2" style={{ color: '#4b5563' }}>
                Total Amount Paid
              </div>
              <div className="text-4xl font-bold">
                LKR {receipt.amount.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            className="border-t-2 pt-6 mt-8 text-center text-xs"
            style={{ borderColor: '#111827', color: '#4b5563' }}
          >
            <p className="mb-2">This is an official payment receipt.</p>
            <p>
              For any inquiries, please contact the property management office.
            </p>
            <p className="mt-4 font-semibold">Thank you for your payment!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
