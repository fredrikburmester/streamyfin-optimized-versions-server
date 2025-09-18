# Optimized versions (Deprecated) 
> A streamyfin companion server for better downloads

## About

⚠️ **Deprecated since Streamyfin 0.30.2**  
> This server is no longer needed and may not work with current versions of Streamyfin. 

Optimized versions is a transcoding server (henceforth refered to as _the server_). It acts as a middleman between the Jellyfin server and the client (Streamyfin app) when downloading content. The job of the server is to combine an HLS stream into a single video file which in turn enables better and more stable downloads in the app. Streamyfin can then also utilize background downloads, which means that the app does not need to be open for the content to download. 

The download in the app becomed a 2 step process.

1. Optimize
2. Download

## Features

- **Video Optimization**: Transcode videos to optimal formats and bitrates
- **Partial Downloads**: Support for HTTP Range requests for efficient streaming
- **File Integrity**: SHA-256 checksum verification for downloaded files
- **Job Management**: Queue and track video optimization jobs
- **Cache Management**: Efficient caching system with automatic cleanup
- **Statistics**: Monitor server performance and usage metrics


Note: The server works best if it's on the same server as the Jellyfin server.

### Docker-compose

## Installation using Docker-compose (example)

```yaml
services:
  app:
    image: fredrikburmester/streamyfin-optimized-versions-server:master
    ports:
      - '3000:3000'
    env_file:
      - .env
    environment:
      - NODE_ENV=development
    restart: unless-stopped

    # If you want to use a local volume for the cache, uncomment the following lines:
    # volumes:
    #  - ./cache:/usr/src/app/cache
```

Create a .env file following the example below or by copying the .env.example file from this repository.

#### .env example

```bash
JELLYFIN_URL=http://your-jellyfin-url 
# MAX_CONCURRENT_JOBS=1 # OPTIONAL default is 1
```

## How it works

### 1. Optimize

A POST request is made to the server with the HLS stream URL. The server will then start a job, downloading the HLS stream to the server, and convert it to a single file. 

In the meantime, the app will poll the server for the progress of the optimize. 

### 2. Download

As soon as the server is finished with the conversion the app (if open) will start downloading the video file. If the app is not open the download will start as soon as the app is opened. After the download has started the app can be minimized. 

This means that the user needs to 1. initiate the download, and 2. open the app once before download. 

### 3. File Transfer Validation

The server implements several validation mechanisms to ensure reliable downloads, it run the checks and then hashes the item using SHA256.

## API Endpoints

- `POST /optimize-version`: Start a new optimization job
- `POST /start-job/:id`: Manually start a queued optimization job
- `GET /download/:id`: Download a transcoded file
- `GET /job-status/:id`: Check job status
- `GET /all-jobs `: Check all jobs status
- `DELETE /cancel-job/:id`: Cancel a job
- `GET /statistics`: Get server statistics
- `DELETE /delete-cache`: Clear the cache

For detailed API documentation, see [API Documentation](API_DOCUMENTATION.md).

## Other

This server can work with other clients and is not limited to only using the Streamyfin client. Though support needs to be added to the clients by the maintainer. 
