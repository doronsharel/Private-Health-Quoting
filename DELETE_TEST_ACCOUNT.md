# How to Delete Test Account: dsharel1220@gmail.com

## Option 1: Delete from Firebase Console (Easiest)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Authentication** → **Users**
4. Find `dsharel1220@gmail.com`
5. Click the three dots (⋮) → **Delete user**
6. Confirm deletion

## Option 2: Delete from Firestore

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Firestore Database**
4. Find the `users` collection
5. Find the document with email `dsharel1220@gmail.com` (or search by UID)
6. Delete the document

## Option 3: Delete from Stripe (Optional)

If you want to clean up Stripe as well:

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Go to **Customers**
3. Find `dsharel1220@gmail.com`
4. Click on the customer
5. **Cancel subscription** (if active)
6. Delete customer (optional - Stripe keeps them for records)

## Quick Delete Script (if you have Firebase Admin access)

You can also delete programmatically, but the Firebase Console method above is easiest.













