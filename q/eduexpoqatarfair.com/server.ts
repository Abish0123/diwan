import express from "express";
import { createServer as createViteServer } from "vite";
import { Resend } from "resend";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Resend with API Key from environment
  const resend = new Resend(process.env.RESEND_API_KEY);

  app.use(cors());
  app.use(express.json());

  // API Route for sending emails
  app.post("/api/send-email", async (req, res) => {
    const { name, company, email, phone, eventType, location, message } = req.body;
    console.log(`Received enquiry from ${name} (${email})`);

    try {
      const { data, error } = await resend.emails.send({
        from: "Crossway Events <onboarding@resend.dev>", // You can update this once you verify your domain
        to: ["info@eduexpoqatar.com"], // Your email
        subject: `New Event Enquiry: ${eventType} from ${name}`,
        html: `
          <h2>New Event Enquiry</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Company:</strong> ${company || 'N/A'}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Event Type:</strong> ${eventType}</p>
          <p><strong>Location:</strong> ${location}</p>
          <p><strong>Message:</strong><br>${message}</p>
          <hr>
          <p>Sent from Crossway Event Management Website</p>
        `,
      });

      if (error) {
        console.error("Resend Error:", error);
        return res.status(400).json({ error });
      }

      console.log("Email sent successfully:", data);
      res.status(200).json({ message: "Email sent successfully", data });
    } catch (err) {
      console.error("Server Error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
