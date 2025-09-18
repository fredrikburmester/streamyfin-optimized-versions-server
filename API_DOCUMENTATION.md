# Optimized Versions Server API Documentation

## Overview
This server provides endpoints for optimizing and downloading video files. It supports partial downloads and file integrity checks.

## Authentication
All endpoints require Jellyfin authentication token in the `Authorization` header.

## Error Responses
All endpoints may return the following error responses:

- `400 Bad Request`: Invalid input parameters
- `401 Unauthorized`: Missing or invalid authentication
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

## Notes
- Partial downloads are supported using the `Range` header
- File integrity is verified using SHA-256 checksums
- Jobs are automatically cleaned up after completion
- Concurrent job processing is limited by configuration 

## Endpoints

### 1. Optimize Video
- **Endpoint**: `POST /optimize-version`
- **Description**: Queues a video for optimization
- **Request Body**:
  ```json
  {
    "url": "string",           // URL of the video to optimize
    "fileExtension": "string", // Desired output format
    "deviceId": "string",      // Client device ID
    "itemId": "string",        // Media item ID
    "item": "object"          // Media item metadata
  }
  ```
- **Response**:
  ```json
  {
    "id": "string"  // Job ID for tracking
  }
  ```

### 2. Download Optimized Video
- **Endpoint**: `GET /download/:id`
- **Description**: Downloads the optimized video file
- **Headers**:
  - `Range`: Optional. Format: `bytes=start-` or `bytes=start-end` for partial downloads
- **Response**: Video file stream
- **Response Headers**:
  - `X-File-Checksum`: String //SHA-256 checksum of the file
  - `X-File-Size`: Number     //Total size of the file in bytes
  - `Content-Range`: String   //For partial downloads, format: `bytes start-end/total`
  - `Content-Length`: Number  //Size of the current response
  - `Content-Type`: String    //`video/mp4`
  - `Accept-Ranges`: String   //`bytes`

### 3. Get Job Status
- **Endpoint**: `GET /job-status/:id`
- **Description**: Returns Job object
- **Response**:
  ```json
  {
    "id": "string",
    "status": "string",    // One of: queued, optimizing, pending downloads limit, completed, failed, cancelled, ready-for-removal
    "progress": number,    // Progress percentage
    "outputPath": "string",
    "inputUrl": "string",
    "deviceId": "string",
    "itemId": "string",
    "timestamp": "string", // ISO date string
    "size": number,
    "item": object,
    "speed": number        // Optional: Processing speed
    "checksum": string     // Optional: Once the job is done, provides a checksum
  }
  ```

### 4. Cancel Job
- **Endpoint**: `DELETE /cancel-job/:id`
- **Description**: Cancels a optimization job
- **Response**:
  ```json
  {
    "message": "string"  // Success or error message
  }
  ```

### 5. Start Job Manually
- **Endpoint**: `POST /start-job/:id`
- **Description**: Manually starts a queued optimization job
- **Response**:
  ```json
  {
    "message": "string"  // Success or error message
  }
  ```

### 6. Get All Jobs
- **Endpoint**: `GET /all-jobs`
- **Description**: Get information about all jobs
- **Response**: Array of job objects (like get job-status but for all jobs)

### 7. Get Statistics
- **Endpoint**: `GET /statistics`
- **Description**: Get server statistics
- **Response**:
  ```json
  {
    "cacheSize": "string",     // Total size of cached files
    "totalTranscodes": number, // Total number of transcoded files
    "activeJobs": number,      // Number of currently active jobs
    "completedJobs": number,   // Number of successfully completed jobs
    "uniqueDevices": number    // Number of unique devices that have used the service
  }
  ```

### 8. Delete Cache
- **Endpoint**: `DELETE /delete-cache`
- **Description**: Cleans up all cached files
- **Response**: Success message

