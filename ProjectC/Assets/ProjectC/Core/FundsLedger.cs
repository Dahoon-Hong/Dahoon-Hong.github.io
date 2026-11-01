using System;
using System.Collections.Generic;

namespace ProjectC.Core
{
    public sealed class FundsLedger
    {
        private readonly Dictionary<string, int> prepayments = new Dictionary<string, int>();
        private readonly HashSet<string> usedOrderIds = new HashSet<string>();
        private readonly HashSet<string> creditedTransactions = new HashSet<string>();
        private readonly HashSet<string> settledOrders = new HashSet<string>();

        public FundsLedger(int startingBalance)
        {
            if (startingBalance < 0) throw new ArgumentOutOfRangeException(nameof(startingBalance));
            Balance = startingBalance;
        }

        public int Balance { get; private set; }
        public int OutstandingPrepayments
        {
            get
            {
                int total = 0;
                foreach (int value in prepayments.Values) total = checked(total + value);
                return total;
            }
        }

        public bool TryPrepay(string orderId, int amount)
        {
            if (string.IsNullOrWhiteSpace(orderId)) throw new ArgumentException("Order ID is required.", nameof(orderId));
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
            if (usedOrderIds.Contains(orderId) || Balance < amount) return false;

            Balance -= amount;
            prepayments.Add(orderId, amount);
            usedOrderIds.Add(orderId);
            return true;
        }

        /// <summary>Settles the final delivered value and refunds the unused prepayment once.</summary>
        public bool SettleDelivered(string orderId, int deliveredAmount)
        {
            if (deliveredAmount < 0) throw new ArgumentOutOfRangeException(nameof(deliveredAmount));
            if (settledOrders.Contains(orderId)) return false;
            if (!prepayments.TryGetValue(orderId, out int prepaid) || deliveredAmount > prepaid) return false;
            prepayments.Remove(orderId);
            settledOrders.Add(orderId);
            Balance = checked(Balance + (prepaid - deliveredAmount));
            return true;
        }

        public bool RefundUndelivered(string orderId, int refundAmount)
        {
            if (refundAmount < 0) throw new ArgumentOutOfRangeException(nameof(refundAmount));
            if (!prepayments.TryGetValue(orderId, out int prepaid) || refundAmount > prepaid) return false;
            return SettleDelivered(orderId, prepaid - refundAmount);
        }

        public void Credit(string transactionId, int amount)
        {
            if (string.IsNullOrWhiteSpace(transactionId)) throw new ArgumentException("Transaction ID is required.", nameof(transactionId));
            if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
            if (!creditedTransactions.Add(transactionId)) return;
            Balance = checked(Balance + amount);
        }
    }
}
