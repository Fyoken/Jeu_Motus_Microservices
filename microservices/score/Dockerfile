# Use a base Node.js image
FROM node:latest

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Expose port 7000
EXPOSE 7000

# Command to run the application
CMD ["node", "app.js"]

