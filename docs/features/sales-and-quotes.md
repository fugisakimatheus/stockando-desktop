# Sales and Quotes

## Purpose

This module supports the sales lifecycle, from customer quoting to order creation and eventual fulfillment.

## Main Resources

### Customers
- store customer identity and contact data
- support classification as individuals or companies
- allow association with sales activity

### Quotes
- represent commercial quotations sent to customers
- contain totals, validity, notes, and status
- support later conversion into orders

### Quote Items
- store the products and values included in each quote

### Quote Order Conversions
- record the relationship between a quote and the resulting order
- enable traceability from proposal to transaction

### Orders
- represent completed or in-progress sales orders
- contain totals, order status, and payment status

### Order Items
- store the products and prices for each order

### Order Payments
- register partial or full payments linked to an order

## Expected Workflows

- create a quote for a customer
- add products and pricing to the quote
- approve, edit, or expire a quote
- convert a quote into an order
- track order payment status

## Notes

This module is the core of the commercial flow and is designed to be extensible for later automation and reporting.
