<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    // Get JSON input
    $json = file_get_contents("php://input");
    $data = json_decode($json, true);

    if (!$data) {
        // Fallback to regular POST if JSON decode fails
        $data = $_POST;
    }

    $name = isset($data['name']) ? strip_tags(trim($data['name'])) : 'N/A';
    $email = isset($data['email']) ? filter_var(trim($data['email']), FILTER_SANITIZE_EMAIL) : 'N/A';
    $company = isset($data['company']) ? strip_tags(trim($data['company'])) : 'N/A';
    $phone = isset($data['phone']) ? strip_tags(trim($data['phone'])) : 'N/A';
    $eventType = isset($data['eventType']) ? strip_tags(trim($data['eventType'])) : 'N/A';
    $location = isset($data['location']) ? strip_tags(trim($data['location'])) : 'N/A';
    $message = isset($data['message']) ? strip_tags(trim($data['message'])) : 'N/A';

    $to = "info@eduexpoqatar.com";
    $subject = "New Event Enquiry: $eventType from $name";

    $email_content = "<h2>New Event Enquiry</h2>";
    $email_content .= "<p><strong>Name:</strong> $name</p>";
    $email_content .= "<p><strong>Company:</strong> $company</p>";
    $email_content .= "<p><strong>Email:</strong> $email</p>";
    $email_content .= "<p><strong>Phone:</strong> $phone</p>";
    $email_content .= "<p><strong>Event Type:</strong> $eventType</p>";
    $email_content .= "<p><strong>Location:</strong> $location</p>";
    $email_content .= "<p><strong>Message:</strong><br>" . nl2br($message) . "</p>";
    $email_content .= "<hr><p>Sent from Crossway Event Management Website</p>";

    $headers = "MIME-Version: 1.0" . "\r\n";
    $headers .= "Content-type:text/html;charset=UTF-8" . "\r\n";
    $headers .= "From: Crossway Website <noreply@eduexpoqatar.com>" . "\r\n";
    $headers .= "Reply-To: $email" . "\r\n";

    if (mail($to, $subject, $email_content, $headers)) {
        echo json_encode(["status" => "success", "message" => "Email sent successfully"]);
    } else {
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Failed to send email"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Method not allowed"]);
}
?>
