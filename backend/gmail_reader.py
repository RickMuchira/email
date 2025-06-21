# /home/rick110/RickDrive/email_automation/backend/gmail_reader.py

import requests
import time
import base64
import json
from email.mime.text import MIMEText
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from typing import List, Dict, Optional, Tuple

def get_gmail_profile(access_token: str) -> Dict:
    """Get Gmail profile information including total message count"""
    headers = {"Authorization": f"Bearer {access_token}"}
    
    try:
        profile_url = "https://gmail.googleapis.com/gmail/v1/users/me/profile"
        response = requests.get(profile_url, headers=headers)
        
        if response.status_code == 200:
            return response.json()
        else:
            print(f"Error fetching Gmail profile: {response.text}")
            return {}
    except Exception as e:
        print(f"Error in get_gmail_profile: {e}")
        return {}

def get_gmail_messages_batch(
    access_token: str, 
    max_results: int = 50, 
    email_id: str = None, 
    query: str = None,
    page_token: str = None
) -> Tuple[List[Dict], Optional[str]]:
    """
    Enhanced Gmail message fetcher with batch processing and pagination
    Returns: (messages_list, next_page_token)
    """
    headers = {"Authorization": f"Bearer {access_token}"}
    start_time = time.time()
    print(f"[{time.time() - start_time:.2f}s] Starting Gmail API call...")

    messages_to_process = []
    next_page_token = None

    if email_id:
        # Fetch specific email
        print(f"[{time.time() - start_time:.2f}s] Fetching specific message: {email_id}...")
        msg_url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{email_id}?format=full"
        msg_response = requests.get(msg_url, headers=headers)
        if msg_response.status_code == 200:
            messages_to_process.append(msg_response.json())
        else:
            print(f"Error fetching specific message {email_id}:", msg_response.text)
            return [], None
    else:
        # List messages with pagination
        list_url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults={max_results}"
        
        if query:
            list_url += f"&q={query}"
        
        if page_token:
            list_url += f"&pageToken={page_token}"
        
        # Default to inbox if no specific query
        if not query or ("in:" not in query.lower() and "label:" not in query.lower()):
            list_url += "&labelIds=INBOX"

        list_response = requests.get(list_url, headers=headers)
        print(f"[{time.time() - start_time:.2f}s] List messages response: {list_response.status_code}")

        if list_response.status_code != 200:
            print("Error listing messages:", list_response.text)
            return [], None

        list_data = list_response.json()
        messages_to_process = list_data.get("messages", [])
        next_page_token = list_data.get("nextPageToken")
        
        if not messages_to_process:
            print(f"[{time.time() - start_time:.2f}s] No messages found with current criteria.")
            return [], next_page_token

        print(f"[{time.time() - start_time:.2f}s] Found {len(messages_to_process)} messages. Fetching details...")

    # Fetch detailed message data
    detailed_messages = []
    batch_size = 10  # Process in smaller batches to avoid timeout
    
    for i in range(0, len(messages_to_process), batch_size):
        batch = messages_to_process[i:i+batch_size]
        print(f"[{time.time() - start_time:.2f}s] Processing batch {i//batch_size + 1}/{(len(messages_to_process) + batch_size - 1)//batch_size}")
        
        for j, msg in enumerate(batch):
            msg_id = msg["id"]
            
            if email_id and msg_id == email_id:
                data = msg
            else:
                msg_url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}?format=full"
                msg_response = requests.get(msg_url, headers=headers)
                
                if msg_response.status_code != 200:
                    print(f"Error fetching message {msg_id}:", msg_response.text)
                    continue
                    
                data = msg_response.json()

            # Extract email details
            email_data = parse_gmail_message(data)
            if email_data:
                detailed_messages.append(email_data)

    print(f"[{time.time() - start_time:.2f}s] Processed {len(detailed_messages)} messages successfully.")
    return detailed_messages, next_page_token

def parse_gmail_message(data: Dict) -> Optional[Dict]:
    """Parse Gmail message data into standardized format"""
    try:
        payload_headers = data.get("payload", {}).get("headers", [])
        headers_dict = {h["name"].lower(): h["value"] for h in payload_headers}
        
        # Extract labels
        labels = data.get("labelIds", [])
        
        # Extract full body
        full_body = extract_email_body(data.get("payload", {}))
        
        return {
            "id": data.get("id"),
            "threadId": data.get("threadId"),
            "historyId": data.get("historyId"),
            "from": headers_dict.get("from", ""),
            "subject": headers_dict.get("subject", ""),
            "snippet": data.get("snippet", ""),
            "internalDate": data.get("internalDate"),
            "full_body": full_body,
            "labels": json.dumps(labels),  # Store as JSON string
            "is_read": 1 if "UNREAD" not in labels else 0,
            "is_replied": 0
        }
    except Exception as e:
        print(f"Error parsing message: {e}")
        return None

def extract_email_body(payload: Dict) -> str:
    """Extract email body from Gmail payload"""
    full_body = ""
    
    # Check for simple body (no parts)
    if not payload.get("parts") and payload.get("body", {}).get("data"):
        try:
            full_body = base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8")
        except Exception as e:
            print(f"Error decoding simple body: {e}")
    else:
        # Handle multipart messages
        parts = payload.get("parts", [])
        for part in parts:
            mime_type = part.get("mimeType")
            body_data = part.get("body", {}).get("data")
            
            if body_data and mime_type in ["text/plain", "text/html"]:
                try:
                    decoded_body = base64.urlsafe_b64decode(body_data).decode("utf-8")
                    if mime_type == "text/plain":
                        full_body = decoded_body
                        break  # Prefer plain text
                    elif not full_body:  # Use HTML if no plain text found
                        full_body = decoded_body
                except Exception as e:
                    print(f"Error decoding part body for type {mime_type}: {e}")
    
    return full_body

def sync_latest_emails(access_token: str, user_email: str, count: int = 50) -> Tuple[List[Dict], Dict]:
    """
    Sync the latest N emails for a user
    Returns: (email_list, sync_metadata)
    """
    print(f"🔄 Starting sync of latest {count} emails for {user_email}")
    
    # Get Gmail profile for total count
    profile = get_gmail_profile(access_token)
    total_messages = profile.get("messagesTotal", 0)
    
    # Fetch latest emails
    emails, next_page_token = get_gmail_messages_batch(
        access_token=access_token,
        max_results=count,
        query="in:inbox"  # Focus on inbox for initial sync
    )
    
    sync_metadata = {
        "total_emails_count": total_messages,
        "last_sync_timestamp": int(time.time()),
        "sync_status": "synced",
        "latest_50_synced": True,
        "next_page_token": next_page_token
    }
    
    print(f"✅ Synced {len(emails)} emails. Total in Gmail: {total_messages}")
    return emails, sync_metadata

def get_older_emails(
    access_token: str, 
    page_token: str, 
    count: int = 50
) -> Tuple[List[Dict], Optional[str]]:
    """
    Get older emails using pagination token
    Returns: (email_list, next_page_token)
    """
    print(f"📄 Fetching {count} older emails with page token")
    
    emails, next_page_token = get_gmail_messages_batch(
        access_token=access_token,
        max_results=count,
        query="in:inbox",
        page_token=page_token
    )
    
    print(f"✅ Fetched {len(emails)} older emails")
    return emails, next_page_token

def send_email(access_token: str, to: str, subject: str, body: str):
    """Send email via Gmail API"""
    print("📤 Sending email...")
    creds = Credentials(token=access_token)
    service = build("gmail", "v1", credentials=creds)

    message = MIMEText(body)
    message["to"] = to
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

    response = service.users().messages().send(userId="me", body={"raw": raw}).execute()
    print("✅ Email sent. Message ID:", response.get("id"))
    return response

# Legacy function for backward compatibility
def get_gmail_messages(access_token: str, max_results: int = 5, email_id: str = None, query: str = None):
    """Legacy function - redirects to new batch function"""
    emails, _ = get_gmail_messages_batch(access_token, max_results, email_id, query)
    return emails