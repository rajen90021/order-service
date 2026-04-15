import mongoose from 'mongoose';
import config from 'config';
import Order from './order/orderModel';
import Coupon from './coupon/couponModel';
import productCacheModel from './productCache/productCacheModel';
import toppingCacheModel from './toppingCache/toppingCacheModel';

const connectDB = async (url: string) => {
  try {
    const conn = await mongoose.connect(url);
    console.log(`Connected to ${url}`);
    return conn;
  } catch (error) {
    console.log('MongoDB connection error', error);
    process.exit(1);
  }
};

const seed = async () => {
    try {
        const orderDbUrl = config.get('database.url') as string;
        await connectDB(orderDbUrl);

        // Clear existing data
        await Order.deleteMany({});
        await Coupon.deleteMany({});
        await productCacheModel.deleteMany({});
        await toppingCacheModel.deleteMany({});
        console.log("Cleared existing order, coupon, and cache data.");

        // Create 100+ Coupons
        const coupons = [];
        for(let i = 1; i <= 105; i++) {
            coupons.push({
                title: i === 1 ? "WELCOME10" : `DISCOUNT${i}`,
                code: i === 1 ? "WELCOME10" : `DISC${i}`,
                discount: 5 + (i % 20),
                validUpto: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                tenantId: 1
            });
        }
        await Coupon.insertMany(coupons);
        console.log(`Seeded ${coupons.length} coupons.`);

        // Now we need to sync products from catalog-service to order-service cache
        const catalogDbUrl = "mongodb://127.0.0.1:27017/catlog_db";
        const catalogConn = mongoose.createConnection(catalogDbUrl);
        
        // Define a temporary model for fetching using any to bypass TS checks
        const ProductSchema = new mongoose.Schema({}, { strict: false });
        const CatalogProduct = catalogConn.model('Product', ProductSchema, 'products');
        
        const ToppingSchema = new mongoose.Schema({}, { strict: false });
        const CatalogTopping = catalogConn.model('Topping', ToppingSchema, 'toppings');

        const catalogProducts = await CatalogProduct.find({});
        console.log(`Found ${catalogProducts.length} products in catalog.`);

        const productCaches = catalogProducts.map((p) => {
            const item = p as unknown as { _id: mongoose.Types.ObjectId; priceConfiguration: unknown };
            return {
                productId: item._id.toString(),
                priceConfiguration: item.priceConfiguration,
            };
        });
        
        if (productCaches.length > 0) {
            await productCacheModel.insertMany(productCaches);
            console.log(`Synced ${productCaches.length} product prices to cache.`);
        }

        const catalogToppings = await CatalogTopping.find({});
        const toppingCaches = catalogToppings.map((t) => {
            const item = t as unknown as { _id: mongoose.Types.ObjectId; price: number; tenantId: string };
            return {
                toppingId: item._id.toString(),
                price: item.price,
                tenantId: item.tenantId,
            };
        });

        if (toppingCaches.length > 0) {
            await toppingCacheModel.insertMany(toppingCaches);
            console.log(`Synced ${toppingCaches.length} topping prices to cache.`);
        }

        await catalogConn.close();
        await mongoose.connection.close();
        console.log("Seed and sync completed successfully!");
    } catch (err) {
        console.error("Error during seeding:", err);
        process.exit(1);
    }
};

seed();
