import requests
import time
import base64
from email.mime.text import MIMEText
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

def get_gmail_messages(access_token: str, max_results: int = 5, email_id: str | None = None, query: str | None = None):
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    start_time = time.time()
    print(f"[{time.time() - start_time:.2f}s] Starting Gmail API call...")

    messages_to_process = []

    if email_id:
        print(f"[{time.time() - start_time:.2f}s] Fetching specific message: {email_id}...")
        # Request full format to get all body parts and headers
        msg_url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{email_id}?format=full"
        msg_response = requests.get(msg_url, headers=headers)
        if msg_response.status_code == 200:
            messages_to_process.append(msg_response.json())
        else:
            print(f"Error fetching specific message {email_id}:", msg_response.text)
            return []
    else:
        list_url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults={max_results}"
        if query:
            list_url += f"&q={query}"
        
        # Always add INBOX label unless a specific label or query is already present that overrides it
        if not query or ("in:inbox" not in query.lower() and "labelids" not in list_url.lower()):
            list_url += "&labelIds=INBOX"

        list_response = requests.get(list_url, headers=headers)
        print(f"[{time.time() - start_time:.2f}s] List messages response: {list_response.status_code}")

        if list_response.status_code != 200:
            print("Error listing messages:", list_response.text)
            return []

        messages_to_process = list_response.json().get("messages", [])
        if not messages_to_process:
            print(f"[{time.time() - start_time:.2f}s] No messages found with current criteria.")
            return []
        print(f"[{time.time() - start_time:.2f}s] Found {len(messages_to_process)} messages. Fetching details...")

    detailed_messages = []
    for i, msg in enumerate(messages_to_process):
        msg_id = msg["id"]
        
        # If we already fetched the full data for a specific email_id, use that
        # Otherwise, fetch the full details for each message in the list
        data = msg
        if not email_id or msg_id != email_id: # Only refetch if not already the specific email, or if it's a list
            msg_url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}?format=full"
            msg_response = requests.get(msg_url, headers=headers)
            print(f"[{time.time() - start_time:.2f}s] Fetched message {i+1}/{len(messages_to_process)} (ID: {msg_id[:5]}...): {msg_response.status_code}")

            if msg_response.status_code != 200:
                print(f"Error fetching message {msg_id}:", msg_response.text)
                continue
            data = msg_response.json()

        payload_headers = data.get("payload", {}).get("headers", [])
        headers_dict = {h["name"].lower(): h["value"] for h in payload_headers}

        full_body = ""
        # Prioritize HTML body, then plain text
        html_body = ""
        plain_body = ""

        def decode_body_part(part_data):
            try:
                return base64.urlsafe_b64decode(part_data).decode("utf-8")
            except Exception as e:
                print(f"Error decoding body part: {e}")
                return ""

        # Recursive function to find parts
        def get_parts(payload):
            if "body" in payload and "data" in payload["body"]:
                if payload["mimeType"] == "text/plain":
                    nonlocal plain_body
                    plain_body = decode_body_part(payload["body"]["data"])
                elif payload["mimeType"] == "text/html":
                    nonlocal html_body
                    html_body = decode_body_part(payload["body"]["data"])
            if "parts" in payload:
                for part in payload["parts"]:
                    get_parts(part)

        get_parts(data.get("payload", {}))

        full_body = html_body if html_body else plain_body # Prefer HTML if available

        detailed_messages.append({
            "id": msg_id,
            "threadId": data.get("threadId"),
            "historyId": data.get("historyId"),
            "from": headers_dict.get("from", ""), # Ensures it defaults to empty string if header is missing
            "subject": headers_dict.get("subject", ""),
            "snippet": data.get("snippet", ""),
            "internalDate": data.get("internalDate"),
            "full_body": full_body,
            "is_read": 0, # Default to unread when fetched
            "is_replied": 0 # Default to unreplied when fetched
        })

    print(f"[{time.time() - start_time:.2f}s] All messages processed. Total time.")
    return detailed_messages


def send_email(access_token: str, to: str, subject: str, body: str):
    print("📤 Sending email...")
    # Credentials object from google.oauth2.credentials
    # This assumes the access_token is valid and has the necessary scopes.
    creds = Credentials(token=access_token)
    
    # Build the Gmail service
    service = build("gmail", "v1", credentials=creds)

    # Create the email message
    message = MIMEText(body)
    message["to"] = to
    message["subject"] = subject
    
    # Encode the message into a base64urlsafe string
    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()

    # Send the email
    response = service.users().messages().send(userId="me", body={"raw": raw_message}).execute()
    print("✅ Email sent. Message ID:", response.get("id"))
    return response