# Render Deployment Configuration

## Environment Variables needed on Render:

```
NODE_ENV=production
PORT=3000
DATABASE_URL=your_postgres_connection_string
JWT_SECRET=your_secure_jwt_secret_here
JWT_EXPIRES_IN=24h
BCRYPT_SALT_ROUNDS=12
```

## Build Command:
```
npm install
```

## Start Command:
```
node coreFSE.js
```

## Important Notes:
1. Make sure to set DATABASE_URL to your PostgreSQL connection string
2. Generate a secure JWT_SECRET (use a random string generator)
3. The app will run on the PORT provided by Render automatically
4. Update the API URL in js/config.js with your actual Render app URL

## Your Render App URL will be something like:
https://your-app-name.onrender.com

Replace "your-render-app-name" in js/config.js with your actual app name.