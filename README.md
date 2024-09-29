# Optimized versions
> A streamyfin companion server for better downloads

## About

Optimized versions is a transcoding server (henceforth refered to as _the server_). It acts as a middleman between the Jellyfin server and the client (Stremyfin app) when downloading content. The job of the server is to combine an HLS stream into a single video file which in turn enables better and more stable downloads in the app. Streamyfin can then also utilize background downloads, which means that the app does not need to be open for the content to download. 

The download in the app becomed a 2 step process.

1. Optimize
2. Download

### 1. Optimize

A POST request is made to the server with the HLS stream URL. The server will then start a job, downloading the HLS stream to the server, and convert it to a single file. 

In the meantime, the app will poll the server for the progress of the optimize. 

### 2. Download

As soon as the server is finished with the conversion the app (if open) will start downloading the video file. If the app is not open the download will start as soon as the app is opened. After the download has started the app can be minimized. 

This means that the user needs to 1. initiate the download, and 2. open the app once before download. 

## Install

The server works best if it's on the same server as the Jellyfin server.

1. Create `.env` file by running `cp .env.example .env`
3. Fill in all enviroment variables
4. Run `docker compose up -d --build`
5. Set the domain and auth token in the app settings.

## Other

This server can work with other clients and is not limited to only using the Streamyfin client. Though support needs to be added to the clients by the maintainer. 
