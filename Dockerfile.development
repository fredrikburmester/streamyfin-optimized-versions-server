FROM node:20

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Install Quick Sync dependencies only if USE_QUICK_SYNC is set to true
ARG USE_QUICK_SYNC=false
RUN if [ "$USE_QUICK_SYNC" = "true" ] ; then \
        apt-get update && apt-get install -y \
        libmfx1 \
        intel-media-va-driver-non-free \
        vainfo \
        && rm -rf /var/lib/apt/lists/* ; \
    fi

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/main"]
