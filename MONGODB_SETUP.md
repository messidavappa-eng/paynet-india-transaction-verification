# How to Get Your MongoDB Connection URI (Free)

Since we have upgraded the application to use a professional database, you need a **MongoDB Connection URI**. The best way to get one for free is using **MongoDB Atlas**.

Follow these exact steps:

### 1. Create an Account
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register).
2. Sign up for a free account (you can use Google login).

### 2. Create a Free Database
1. You will be asked to "Deploy a cloud database".
2. Select **M0 (Free)** (it might be selected by default).
3. Choose a provider (AWS is fine) and a region close to you (e.g., Mumbai `ap-south-1`).
4. Click **Create Deployment** or **Create**.

### 3. Create a Database User
1. You will see a "Security Quickstart" or "Database Access" section.
2. Create a **Username** (e.g., `paynet_admin`).
3. Create a **Password** (e.g., `securePassword123`) - **WRITE THIS DOWN!**
4. Click **Create Database User**.

### 4. Allow Access (Network Access)
1. Go to "Network Access" (or "IP Access List").
2. Click **Add IP Address**.
3. Select **Allow Access from Anywhere** (enters `0.0.0.0/0`).
   * *This is required for Render to connect to your database.*
4. Click **Confirm**.

### 5. Get the Connection String (URI)
1. Go back to the **Database** tab (on the left menu).
2. Click the **Connect** button on your cluster.
3. Select **Drivers** (Node.js, Go, Python, etc.).
4. Ensure **Version** is set to **Node.js 5.5 or later**.
5. **Copy the Connection String**. It will look like this:
   ```
   mongodb+srv://paynet_admin:<db_password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```

### 6. Final Step: Configure Your App
1. Paste the copied string into a text editor.
2. Replace `<db_password>` with the password you created in Step 3.
   * Example: `mongodb+srv://paynet_admin:securePassword123@cluster0...`
   * *Note: Remove the `<` and `>` brackets!*
3. **For Render Deployment**:
   * Go to your Render Dashboard -> Select your Project -> **Environment**.
   * Add a new Environment Variable:
     * **Key**: `MONGO_URI`
     * **Value**: (Your full connection string)
4. **For Local Testing**:
   * Add `MONGO_URI` to your `.env` file.
