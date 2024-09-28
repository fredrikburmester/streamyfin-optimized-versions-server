FROM node:20

# Install FFmpeg, wget, and gnupg2
RUN apt-get update && apt-get install -y ffmpeg wget gnupg2 && rm -rf /var/lib/apt/lists/* 

# Add Intel's repository key and source list
RUN wget -qO - https://repositories.intel.com/graphics/intel-graphics.key | apt-key add - \
    && echo "deb [arch=amd64] https://repositories.intel.com/graphics/ubuntu focal main" > /etc/apt/sources.list.d/intel-gpu.list

# Install Quick Sync dependencies only if USE_QUICK_SYNC is set to true
ARG USE_QUICK_SYNC=false
RUN if [ "$USE_QUICK_SYNC" = "true" ]; then \
    apt-get update && apt-get install -y \
        libmfx1 \
        intel-media-va-driver-non-free \
        vainfo \
        && rm -rf /var/lib/apt/lists/*; \
    fi

# Set working directory
WORKDIR /usr/src/app

# Copy and install npm packages
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"]
