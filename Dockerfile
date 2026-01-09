# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Install git
RUN apk add --no-cache git

# Set the working directory
WORKDIR /app

# Copy package.json to the working directory
COPY package.json ./

# Install dependencies (express, js-yaml, axios are in package.json)
RUN npm install

# Copy the rest of the application code
COPY . .

# Remove the broken submodule integration to force fresh clone on start
RUN rm -rf docs/domain-list-community

# Expose the port the app runs on
EXPOSE 8080

# Define the entry point for the application
CMD ["node", "index.js"]
