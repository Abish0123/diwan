import { io } from "socket.io-client";

// In development, the socket server is the same as the dev server
// In production, it should point to the correct URL
const socket = io();

export default socket;
