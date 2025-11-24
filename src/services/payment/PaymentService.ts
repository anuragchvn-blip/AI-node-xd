import Razorpay from 'razorpay';
import crypto from 'crypto';
import prisma from '../../db/prisma';
import dotenv from 'dotenv';
import { logger } from '../../utils/logger';

dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

export class PaymentService {
  /**
   * Create a Razorpay Order
   */
  async createOrder(orgId: string, amount: number, credits: number): Promise<any> {
    const options = {
      amount: amount * 100, // Amount in paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: {
        orgId,
        credits,
      },
    };

    try {
      const order = await razorpay.orders.create(options);

      // Log transaction as pending using Prisma
      await prisma.transaction.create({
        data: {
          orgId,
          razorpayOrderId: order.id,
          amount: amount * 100,
          creditsAdded: credits,
          status: 'pending',
        },
      });

      logger.info('Razorpay order created', { orderId: order.id, orgId });
      return order;
    } catch (error: any) {
      logger.error('Razorpay order creation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify Payment Signature and Add Credits
   */
  async verifyPayment(params: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): Promise<boolean> {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = params;

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      // Payment successful
      await this.fulfillTransaction(razorpay_order_id, razorpay_payment_id);
      return true;
    } else {
      logger.warn('Invalid payment signature', { orderId: razorpay_order_id });
      return false;
    }
  }

  /**
   * Fulfill transaction: Update status and add credits using Prisma transaction
   */
  private async fulfillTransaction(orderId: string, paymentId: string): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Update transaction status
        const transaction = await tx.transaction.update({
          where: { razorpayOrderId: orderId },
          data: {
            status: 'success',
            razorpayPaymentId: paymentId,
          },
        });

        // 2. Add credits to organization
        await tx.organization.update({
          where: { id: transaction.orgId },
          data: {
            creditsBalance: {
              increment: transaction.creditsAdded,
            },
          },
        });

        logger.info('Transaction fulfilled', { orderId, creditsAdded: transaction.creditsAdded });
      });
    } catch (error: any) {
      logger.error('Transaction fulfillment failed', { error: error.message, orderId });
      throw error;
    }
  }
}

export default new PaymentService();
