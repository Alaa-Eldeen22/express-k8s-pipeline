FROM node:20-alpine

# Set environment variable to production for optimized performance
ENV NODE_ENV=production

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies with a clean, deterministic install from the lockfile
RUN npm ci --omit=dev && npm cache clean --force

# Copy the rest of the application source code
COPY . .

# Change ownership of the application files to the non-root user
RUN chown -R node:node /usr/src/app

# Run the container as a non-root user for security best practices
USER node

# Expose the port the application listens on
EXPOSE 3000

# Start the application
CMD ["node", "index.js"]
