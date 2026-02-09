/**
 * Seed script to create 30 dummy approved reviews
 * Run: node backend/scripts/seedReviews.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Review = require('../models/Review');

// Dummy reviews data (30 reviews: mix of Donor, Receiver, Driver)
const dummyReviews = [
  { name: "Vijay", role: "Donor", text: "Food Loop is an amazing initiative. Donating excess food was simple." },
  { name: "Anita S.", role: "Driver", text: "Being part of the distribution team has been the most fulfilling experience." },
  { name: "Grand Hotel", role: "Donor", text: "We drastically reduced our food waste thanks to their efficient pickup system." },
  { name: "Suresh K.", role: "Driver", text: "The app makes navigation to pickup points seamless and quick." },
  { name: "Meera R.", role: "Donor", text: "I love transparency. Knowing exactly where my donation went is priceless." },
  { name: "City Bakery", role: "Donor", text: "Finally a reliable way to ensure our unsold bread helps the community." },
  { name: "Rahul T.", role: "Receiver", text: "Connecting donors to those in need—Food Loop bridges the gap perfectly." },
  { name: "Community Kitchen", role: "Receiver", text: "The consistent supply of fresh vegetables has helped us feed hundreds more." },
  { name: "Priya M.", role: "Donor", text: "Super intuitive application. It took me 2 minutes to list my donation." },
  { name: "Arun D.", role: "Driver", text: "Every trip feels meaningful. This platform is a game changer." },
  { name: "Kavya L.", role: "Donor", text: "A wonderful way to share blessings on special occasions like birthdays." },
  { name: "Green Grocers", role: "Donor", text: "Zero waste goal is now achievable. Highly recommend Food Loop." },
  { name: "Vikram S.", role: "Driver", text: "Seeing the smiles on children's faces when we deliver is everything." },
  { name: "Sarah J.", role: "Donor", text: "Effective, transparent, and impactful. Keep up the great work!" },
  { name: "Noor F.", role: "Receiver", text: "We are grateful for the support. It makes a huge difference in our daily supplies." },
  { name: "Lakshmi N.", role: "Donor", text: "Smooth process from listing to pickup. Our staff loves using Food Loop." },
  { name: "Rajesh P.", role: "Driver", text: "Flexible timings and clear instructions. Best volunteer experience so far." },
  { name: "Hope Shelter", role: "Receiver", text: "Regular donations have allowed us to expand our meal programs significantly." },
  { name: "Deepa K.", role: "Donor", text: "Reducing waste while helping others—exactly what we needed for our events." },
  { name: "Manoj V.", role: "Driver", text: "The tracking and confirmation flow is simple. No confusion on routes." },
  { name: "Sunrise NGO", role: "Receiver", text: "Quality of food received is always good. Donors and drivers are reliable." },
  { name: "Neha G.", role: "Donor", text: "Quick response when we have surplus. The team is very professional." },
  { name: "Karthik R.", role: "Driver", text: "Knowing each delivery helps someone in need keeps me motivated every day." },
  { name: "Grace Foundation", role: "Receiver", text: "Food Loop has become a key partner in our community feeding initiative." },
  { name: "Ramesh B.", role: "Donor", text: "Easy signup and listing. We now donate weekly without any hassle." },
  { name: "Divya S.", role: "Driver", text: "App is fast and reliable. Pickup and drop points are always accurate." },
  { name: "Seva Trust", role: "Receiver", text: "We receive a variety of items that help us plan balanced meals." },
  { name: "Anil M.", role: "Donor", text: "Transparent and trustworthy. We recommend Food Loop to all our partners." },
  { name: "Pooja C.", role: "Driver", text: "Support team is helpful. Great initiative for the environment and society." },
  { name: "Care Home", role: "Receiver", text: "Timely deliveries and respectful drivers. Thank you Food Loop and all donors." },
];

async function seedReviews() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/foodloop';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Check if reviews already exist
    const existingCount = await Review.countDocuments({ status: 'approved' });
    if (existingCount >= 30) {
      console.log(`⚠️  Already have ${existingCount} approved reviews. Skipping seed.`);
      await mongoose.connection.close();
      return;
    }

    // Create reviews
    const total = dummyReviews.length;
    const reviewsToCreate = dummyReviews.map((review, index) => ({
      userId: new mongoose.Types.ObjectId(), // Dummy user ID
      userRole: review.role,
      userName: review.name,
      reviewText: review.text,
      status: 'approved',
      approvedBy: new mongoose.Types.ObjectId(), // Dummy admin ID
      approvedAt: new Date(Date.now() - (total - index) * 24 * 60 * 60 * 1000), // Stagger dates
      createdAt: new Date(Date.now() - (total - index) * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - (total - index) * 24 * 60 * 60 * 1000),
    }));

    const createdReviews = await Review.insertMany(reviewsToCreate);
    console.log(`✅ Created ${createdReviews.length} dummy approved reviews`);

    // Display summary
    const donorCount = createdReviews.filter(r => r.userRole === 'Donor').length;
    const receiverCount = createdReviews.filter(r => r.userRole === 'Receiver').length;
    const driverCount = createdReviews.filter(r => r.userRole === 'Driver').length;

    console.log('\n📊 Summary:');
    console.log(`   Donors: ${donorCount}`);
    console.log(`   Receivers: ${receiverCount}`);
    console.log(`   Drivers: ${driverCount}`);
    console.log(`   Total: ${createdReviews.length}`);

    await mongoose.connection.close();
    console.log('\n✅ Seed completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding reviews:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run seed
seedReviews();
