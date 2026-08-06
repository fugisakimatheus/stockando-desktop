# Catalog and Inventory

## Purpose

This module manages products, categories, stock, and warehouse operations. It is the core of the operating structure for companies that sell or distribute goods.

## Main Resources

### Categories
- organize products into logical groups
- support nested category hierarchies

### Units of Measure
- define measurement units such as unit, box, kg, or liter
- connect products to their operational unit

### Products
- store SKU, name, description, barcode, and pricing
- support inventory tracking flags
- connect products to categories and units

### Warehouses
- represent physical storage locations
- support stock location management

### Stock
- store current stock quantity per product and warehouse
- support real-time inventory visibility

### Stock Movements
- record stock inflows and outflows
- capture movement references and notes

### Stock Adjustments
- support inventory corrections and operational adjustments
- allow recording of reason and responsible user

## Expected Workflows

- create and maintain a product catalog
- assign products to categories and units
- manage warehouse locations
- track stock balances and movement history
- perform stock adjustments when necessary

## Notes

The inventory layer is designed to support both transactional operations and operational controls.
