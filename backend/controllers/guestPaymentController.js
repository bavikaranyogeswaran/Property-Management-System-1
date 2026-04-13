import onboardingService from '../services/onboardingService.js';
import paymentService from '../services/paymentService.js';
import catchAsync from '../utils/catchAsync.js';

class GuestPaymentController {
  getInvoiceDetails = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const details = await onboardingService.getInvoiceByToken(token);
    res.json(details);
  });

  submitPayment = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const file = req.file;

    const paymentId = await paymentService.submitGuestPayment(
      req.body,
      token,
      file
    );

    res.status(201).json({
      message:
        'Payment evidence submitted successfully. Our team will verify it shortly.',
      paymentId,
    });
  });

  getActivationStatus = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const status = await onboardingService.getActivationStatus(token);
    res.json(status);
  });

  getActivationStatusByOrder = catchAsync(async (req, res, next) => {
    const { orderId } = req.params;
    const status = await onboardingService.getActivationStatusByOrder(orderId);
    res.json(status);
  });

  getStatus = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const status = await onboardingService.getTrackerStatus(token);
    res.json(status);
  });
}

export default new GuestPaymentController();
