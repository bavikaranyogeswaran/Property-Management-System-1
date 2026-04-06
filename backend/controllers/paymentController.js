// ============================================================================
//  PAYMENT CONTROLLER (The Bank Teller)
// ============================================================================
//  This file handles all money coming IN.
//  - Tenants submitting proof of payment.
//  - Treasurers verifying the money is in the bank.
//  - Generating Receipts.
// ============================================================================

import paymentService from '../services/paymentService.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';

class PaymentController {
  //  SUBMIT PAYMENT: Tenant uploads a slip or says "I paid X amount".
  submitPayment = catchAsync(async (req, res, next) => {
    const tenantId = req.user.id;
    // Pass the file object if it exists
    const paymentId = await paymentService.submitPayment(
      req.body,
      tenantId,
      req.file
    );

    res
      .status(201)
      .json({ message: 'Payment submitted for verification', paymentId });
  });

  //  VERIFY PAYMENT: Treasurer looks at bank statement and says "Yes, money is here".
  verifyPayment = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { status, reason } = req.body; // 'verified' or 'rejected'

    const updatedPayment = await paymentService.verifyPayment(
      id,
      status,
      req.user,
      reason
    );

    res.json({ message: `Payment ${status}`, payment: updatedPayment });
  });

  getPayments = catchAsync(async (req, res, next) => {
    const payments = await paymentService.getPayments(req.user);
    return res.json(payments);
  });
}

export default new PaymentController();
