# /home/rick110/RickDrive/email_automation/backend/main.py

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, EmailStr
from fastapi.middleware.cors import CORSMiddleware
import groq
import time
from typing import Optional, List
import base64
import email
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import json
import requests
import os
from dotenv import load_dotenv
from enhanced_sentiment_system import process_email_with_enhanced_ai

# Load environment variables
load_dotenv()

# Import enhanced database and Gmail reader functions
from database import (
    get_emails_from_db, insert_email, update_email_status, 
    get_user_email_count, update_user_sync_metadata, 
    get_user_sync_metadata, create_tables, get_db_connection, initialize_enhanced_sentiment_system
)
from gmail_reader import (
    sync_latest_emails, get_older_emails, send_email, 
    get_gmail_profile, get_gmail_messages
)

# --- Groq Client Initialization ---
# Paste your Groq API key below. Do NOT use .env or environment variables for this key.
GROQ_API_KEY = "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"  # <-- Paste your Groq API key here (e.g., gsk_xxx...)

try:
    if not GROQ_API_KEY or GROQ_API_KEY == "YOUR_GROQ_API_KEY_HERE":
        print("🔴 WARNING: Groq API key is not set. AI features will be disabled.")
        groq_client = None
    else:
        groq_client = groq.Client(api_key=GROQ_API_KEY)
        print("✅ Groq client initialized successfully.")
except Exception as e:
    print(f"🔴 WARNING: Failed to initialize Groq client. AI features disabled. Error: {e}")
    groq_client = None

app = FastAPI()

# --- CORS Middleware ---
origins = ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Utility Functions ---
def normalize_email_fields(email_data: dict) -> dict:
    """Normalize email field names for frontend compatibility"""
    # Handle both database row objects and dictionary objects
    if hasattr(email_data, 'keys'):
        data = dict(email_data)
    else:
        data = email_data

    return {
        "id": data.get("id"),
        "threadId": data.get("threadId"),
        "from": data.get("from") or data.get("from_address", ""),
        "subject": data.get("subject", ""),
        "snippet": data.get("snippet", ""),
        "sentiment": data.get("sentiment", "N/A"),
        "sentiment_display": data.get("sentiment_display"),
        "priority_level": data.get("priority_level"),
        "priority_name": data.get("priority_name"),
        "confidence": data.get("confidence"),
        "reply_status": data.get("reply_status", "Not Replied"),
        "suggested_reply_body": data.get("suggested_reply_body"),
        "full_body": data.get("full_body", ""),
        "internalDate": data.get("internalDate"),
        "is_read": data.get("is_read", 0),
        "is_replied": data.get("is_replied", 0),
        "user_email": data.get("user_email"),
        "labels": data.get("labels"),
        "payload": data.get("payload")
    }

def process_email_with_ai(email_data: dict) -> dict:
    """Process email with enhanced AI for sentiment and reply suggestion (ENHANCED)"""
    # You may need to pass the groq_client if it's a global or context variable
    global groq_client
    return process_email_with_enhanced_ai(email_data, groq_client)

def update_database_schema():
    """Add user_email column if it doesn't exist"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Check if user_email column exists
        cursor.execute("PRAGMA table_info(emails)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'user_email' not in columns:
            print("📝 Adding user_email column to emails table...")
            cursor.execute("ALTER TABLE emails ADD COLUMN user_email TEXT")
            conn.commit()
            print("✅ user_email column added successfully")
    
    except Exception as e:
        print(f"Schema update error: {e}")
    finally:
        conn.close()

# Helper functions for Gmail API operations
def send_email_with_gmail_api(access_token: str, raw_message: str, thread_id: Optional[str] = None):
    """Send email via Gmail API with proper threading support"""
    url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    data = {"raw": raw_message}
    if thread_id:
        data["threadId"] = thread_id
    
    response = requests.post(url, headers=headers, json=data)
    
    if response.status_code != 200:
        raise Exception(f"Gmail API error: {response.status_code} - {response.text}")
    
    return response.json()

def get_gmail_thread(access_token: str, thread_id: str):
    """Fetch Gmail thread details"""
    url = f"https://gmail.googleapis.com/gmail/v1/users/me/threads/{thread_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    
    response = requests.get(url, headers=headers)
    
    if response.status_code != 200:
        raise Exception(f"Gmail API error: {response.status_code} - {response.text}")
    
    return response.json()

def modify_gmail_labels(access_token: str, message_id: str, add_labels: List[str] = None, remove_labels: List[str] = None):
    """Modify Gmail labels for a message"""
    url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}/modify"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    data = {}
    if add_labels:
        data["addLabelIds"] = add_labels
    if remove_labels:
        data["removeLabelIds"] = remove_labels
    
    response = requests.post(url, headers=headers, json=data)
    
    if response.status_code != 200:
        raise Exception(f"Gmail API error: {response.status_code} - {response.text}")
    
    return response.json()

# Enhanced database functions
def get_emails_from_db_enhanced(
    user_email: str = None,
    limit: int = 10,
    offset: int = 0,
    sentiment: str = None,
    reply_status: str = None,
    is_read: bool = None,
    is_replied: bool = None,
    email_id: str = None
) -> List[dict]:
    """Get emails from database with proper filtering"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Build query dynamically
    query = "SELECT * FROM emails WHERE 1=1"
    params = []

    if user_email:
        query += " AND user_email = ?"
        params.append(user_email)
        
    if email_id:
        query += " AND id = ?"
        params.append(email_id)

    if sentiment:
        query += " AND sentiment = ?"
        params.append(sentiment.upper())
    if reply_status:
        query += " AND reply_status = ?"
        params.append(reply_status)
    if is_read is not None:
        query += " AND is_read = ?"
        params.append(1 if is_read else 0)
    if is_replied is not None:
        query += " AND is_replied = ?"
        params.append(1 if is_replied else 0)

    # Order by most recent first
    query += " ORDER BY internalDate DESC"
    
    # Add limit and offset for pagination (only if not searching for specific email)
    if not email_id:
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

    try:
        cursor.execute(query, params)
        rows = cursor.fetchall()
        emails = [dict(row) for row in rows]
        conn.close()
        
        print(f"📊 Database query returned {len(emails)} emails")
        return emails
        
    except Exception as e:
        conn.close()
        print(f"❌ Database query error: {e}")
        return []

def insert_email_enhanced(email_data: dict, user_email: str):
    """Insert or update email with user_email"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Add user_email to the data
    email_data['user_email'] = user_email
    
    try:
        # Check if email already exists for this user
        cursor.execute("SELECT id FROM emails WHERE id = ? AND user_email = ?", 
                       (email_data['id'], user_email))
        existing_email = cursor.fetchone()

        if existing_email:
            print(f"📝 Updating existing email {email_data['id']} for user {user_email}")
            cursor.execute("""
                UPDATE emails
                SET from_address = ?, subject = ?, snippet = ?, sentiment = ?,
                    reply_status = ?, suggested_reply_body = ?, full_body = ?,
                    is_read = ?, is_replied = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_email = ?
            """, (
                email_data.get('from', ''),
                email_data.get('subject', ''),
                email_data.get('snippet', ''),
                email_data.get('sentiment', 'N/A'),
                email_data.get('reply_status', 'Not Replied'),
                email_data.get('suggested_reply_body'),
                email_data.get('full_body'),
                int(email_data.get('is_read', 0)),
                int(email_data.get('is_replied', 0)),
                email_data['id'],
                user_email
            ))
        else:
            print(f"📥 Inserting new email {email_data['id']} for user {user_email}")
            cursor.execute("""
                INSERT INTO emails (id, threadId, historyId, from_address, subject, snippet, 
                                  internalDate, sentiment, reply_status, suggested_reply_body, 
                                  full_body, is_read, is_replied, user_email)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                email_data['id'],
                email_data.get('threadId'),
                email_data.get('historyId'),
                email_data.get('from', ''),
                email_data.get('subject', ''),
                email_data.get('snippet', ''),
                email_data.get('internalDate'),
                email_data.get('sentiment', 'N/A'),
                email_data.get('reply_status', 'Not Replied'),
                email_data.get('suggested_reply_body'),
                email_data.get('full_body'),
                int(email_data.get('is_read', 0)),
                int(email_data.get('is_replied', 0)),
                user_email
            ))
        
        conn.commit()
        print(f"✅ Email {email_data['id']} saved successfully")
        
    except Exception as e:
        print(f"❌ Database save error: {e}")
        conn.rollback()
    finally:
        conn.close()

@app.on_event("startup")
async def enhanced_startup_event():
    """Enhanced startup to initialize sentiment system"""
    try:
        create_tables()
        update_database_schema()
        # Initialize enhanced sentiment system
        initialize_enhanced_sentiment_system()
        print("✅ Enhanced Email Automation System initialized successfully!")
    except Exception as e:
        print(f"❌ Enhanced system initialization failed: {e}")

# --- Pydantic Models ---
class TokenPayload(BaseModel):
    access_token: str
    refresh_token: str | None = None
    user_email: EmailStr

class SendEmailPayload(BaseModel):
    access_token: str
    to: EmailStr
    subject: str
    body: str
    original_message_id: str | None = None

class UpdateEmailStatusPayload(BaseModel):
    email_id: str
    is_read: bool | None = None
    is_replied: bool | None = None
    reply_status: str | None = None

class SyncStatusResponse(BaseModel):
    user_email: str
    total_emails_in_gmail: int
    emails_in_local_db: int
    last_sync_timestamp: Optional[int]
    sync_status: str
    latest_50_synced: bool

class GenerateEmailBodyRequest(BaseModel):
    access_token: str
    user_email: EmailStr
    context: str
    sender: EmailStr
    subject: str
    original_body: Optional[str] = None
    reply_type: str = "reply"  # "reply", "reply-all", "forward"

class EmailHeaders(BaseModel):
    access_token: str
    to: str
    subject: str
    body: str
    cc: Optional[str] = None
    bcc: Optional[str] = None
    inReplyTo: Optional[str] = None
    references: Optional[str] = None
    threadId: Optional[str] = None

# --- API Endpoints ---
@app.get("/")
async def read_root():
    return {"message": "Enhanced FastAPI Email Automation Backend is running!"}

@app.post("/api/store-token")
async def store_token(payload: TokenPayload):
    """Store token and initialize user sync metadata if needed"""
    print(f"Received token for {payload.user_email}")
    
    # Initialize user sync metadata if doesn't exist
    sync_metadata = get_user_sync_metadata(str(payload.user_email))
    if not sync_metadata:
        update_user_sync_metadata(
            user_email=str(payload.user_email),
            sync_status="never_synced",
            latest_50_synced=False
        )
        print(f"✅ Initialized sync metadata for {payload.user_email}")
    
    return {"message": "Token received successfully!", "email": payload.user_email}

@app.get("/api/sync-status/{user_email}")
async def get_sync_status(user_email: str) -> SyncStatusResponse:
    """Get synchronization status for a user"""
    sync_metadata = get_user_sync_metadata(user_email)
    local_email_count = get_user_email_count(user_email)
    
    if not sync_metadata:
        return SyncStatusResponse(
            user_email=user_email,
            total_emails_in_gmail=0,
            emails_in_local_db=local_email_count,
            last_sync_timestamp=None,
            sync_status="never_synced",
            latest_50_synced=False
        )
    
    return SyncStatusResponse(
        user_email=user_email,
        total_emails_in_gmail=sync_metadata.get("total_emails_count", 0),
        emails_in_local_db=local_email_count,
        last_sync_timestamp=sync_metadata.get("last_sync_timestamp"),
        sync_status=sync_metadata.get("sync_status", "never_synced"),
        latest_50_synced=bool(sync_metadata.get("latest_50_synced", 0))
    )

@app.post("/api/sync-latest-emails")
async def sync_latest_emails_endpoint(payload: TokenPayload, count: int = Query(50, le=100)):
    """Sync the latest N emails from Gmail for the user"""
    print(f"🔄 Syncing latest {count} emails for {payload.user_email}")
    
    if not payload.access_token:
        raise HTTPException(status_code=400, detail="Access token is missing.")
    
    try:
        # Update sync status to 'syncing'
        update_user_sync_metadata(
            user_email=str(payload.user_email),
            sync_status="syncing"
        )
        
        # Sync latest emails from Gmail
        emails, next_page_token = sync_latest_emails(
            access_token=payload.access_token,
            user_email=str(payload.user_email),
            count=count
        )
        
        # Store emails in database
        for email_data in emails:
            email_data = process_email_with_ai(email_data)
            insert_email_enhanced(email_data, str(payload.user_email))
        
        # Update sync metadata
        update_user_sync_metadata(
            user_email=str(payload.user_email),
            total_emails_count=len(emails),
            last_sync_timestamp=int(time.time()),
            sync_status="completed",
            latest_50_synced=True,
            next_page_token=next_page_token
        )
        
        print(f"✅ Successfully synced {len(emails)} emails for {payload.user_email}")
        
        return {
            "message": f"Successfully synced {len(emails)} latest emails",
            "emails_synced": len(emails),
            "total_emails_in_gmail": len(emails),
            "user_email": payload.user_email
        }
        
    except Exception as e:
        print(f"❌ Error syncing emails for {payload.user_email}: {e}")
        update_user_sync_metadata(
            user_email=str(payload.user_email),
            sync_status="error"
        )
        raise HTTPException(status_code=500, detail=f"Failed to sync emails: {str(e)}")

@app.post("/api/read-emails")
async def read_emails_simplified(
    payload: TokenPayload,
    email_id: str | None = Query(None, description="Optional email ID to fetch a specific email"),
    fetch_new: bool = Query(False, description="Whether to fetch new emails from Gmail"),
    limit: int = Query(10, description="Maximum number of emails to return"),
    offset: int = Query(0, description="Number of emails to skip for pagination")
):
    """Simplified email reading focused on display reliability"""
    print(f"🔄 Processing /api/read-emails: email_id={email_id}, fetch_new={fetch_new}")

    if not payload.access_token:
        raise HTTPException(status_code=400, detail="Access token is missing.")

    try:
        # Handle specific email ID request
        if email_id:
            print(f"📧 Fetching specific email ID: {email_id}")
            
            # Always check database first
            db_email = None
            try:
                db_emails = get_emails_from_db_enhanced(user_email=str(payload.user_email), email_id=email_id)
                if db_emails:
                    db_email = db_emails[0]
                    print(f"✅ Found email in database: {email_id}")
            except Exception as e:
                print(f"⚠️ Database lookup failed: {e}")

            # Only fetch from Gmail if specifically requested AND not in database
            if not db_email and fetch_new:
                print(f"🔍 Fetching email {email_id} from Gmail...")
                try:
                    gmail_emails = get_gmail_messages(
                        access_token=payload.access_token,
                        email_id=email_id,
                        max_results=1
                    )
                    
                    if gmail_emails:
                        email_data = gmail_emails[0]
                        email_data['user_email'] = str(payload.user_email)
                        
                        # Try AI processing but don't let it block
                        email_data = process_email_with_ai(email_data)
                        
                        # Save to database
                        insert_email_enhanced(email_data, str(payload.user_email))
                        db_email = email_data
                        print(f"✅ Email {email_id} saved to database")
                    else:
                        print(f"❌ Email {email_id} not found in Gmail")
                
                except Exception as e:
                    print(f"❌ Gmail fetch failed: {e}")

            # Return email if we have it, otherwise 404
            if db_email:
                normalized_email = normalize_email_fields(db_email)
                print(f"✅ Returning email: {normalized_email.get('id')}")
                return {
                    "email": normalized_email,
                    "message": f"Email {email_id} retrieved successfully"
                }
            else:
                raise HTTPException(status_code=404, detail=f"Email with ID {email_id} not found")

        # Handle list request (no specific email_id)
        else:
            print(f"📋 Fetching email list: limit={limit}, offset={offset}")
            
            # Get emails from database
            try:
                db_emails = get_emails_from_db_enhanced(
                    user_email=str(payload.user_email),
                    limit=limit,
                    offset=offset
                )
                
                # Normalize field names for all emails
                normalized_emails = [normalize_email_fields(email) for email in db_emails]
                
                # Get total count for pagination
                total_count = get_user_email_count(str(payload.user_email))
                
                return {
                    "emails": normalized_emails,
                    "total_count": total_count,
                    "offset": offset,
                    "limit": limit,
                    "has_more": len(normalized_emails) == limit,
                    "message": f"Retrieved {len(normalized_emails)} emails"
                }
                
            except Exception as e:
                print(f"❌ Database query failed: {e}")
                return {
                    "emails": [],
                    "total_count": 0,
                    "offset": offset,
                    "limit": limit,
                    "has_more": False,
                    "message": "Failed to retrieve emails from database"
                }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/send-email-with-headers")
async def send_email_with_headers(payload: EmailHeaders):
    """Send email with proper Gmail headers for threading and reply protocols"""
    print(f"🔄 Sending email with headers: To={payload.to}, Subject={payload.subject}")
    
    try:
        # Create the email message with proper headers
        if payload.cc or payload.bcc:
            msg = MIMEMultipart()
            msg.attach(MIMEText(payload.body, 'plain', 'utf-8'))
        else:
            msg = MIMEText(payload.body, 'plain', 'utf-8')
            
        msg['To'] = payload.to
        msg['Subject'] = payload.subject
        
        # Add CC and BCC if provided
        if payload.cc:
            msg['Cc'] = payload.cc
        if payload.bcc:
            msg['Bcc'] = payload.bcc
            
        # Add threading headers for proper Gmail conversation handling
        if payload.inReplyTo:
            msg['In-Reply-To'] = payload.inReplyTo
        if payload.references:
            msg['References'] = payload.references
            
        # Convert to raw format for Gmail API
        raw_message = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')
        
        # Send via Gmail API with proper headers
        response = send_email_with_gmail_api(
            access_token=payload.access_token,
            raw_message=raw_message,
            thread_id=payload.threadId
        )
        
        return {
            "message": "Email sent successfully with headers",
            "message_id": response.get("id"),
            "thread_id": response.get("threadId"),
            "to": payload.to
        }
        
    except Exception as e:
        print(f"❌ Error sending email with headers: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

@app.post("/api/generate-email-body")
async def generate_email_body(payload: GenerateEmailBodyRequest):
    """Generate email body using Groq AI"""
    print(f"🤖 Generating email body for {payload.user_email}")
    
    if not groq_client:
        raise HTTPException(status_code=500, detail="Groq client is not configured.")
    
    try:
        # Create context-aware system prompt based on reply type
        if payload.reply_type == "reply":
            system_prompt = """You are a professional email assistant. Draft a direct reply to the original sender. 
            Be concise, professional, and address their specific points. Match their tone while maintaining professionalism."""
            
        elif payload.reply_type == "reply-all":
            system_prompt = """You are a professional email assistant. Draft a reply that will go to all recipients. 
            Be mindful that multiple people will see this response. Keep it professional and inclusive."""
            
        elif payload.reply_type == "forward":
            system_prompt = """You are a professional email assistant. Draft a forwarding message that introduces 
            the forwarded content. Explain why you're sharing this and what action (if any) is needed."""
            
        else:
            system_prompt = """You are a professional email assistant. Draft a clear, professional email response 
            based on the user's instructions."""

        # Build user prompt with full context
        user_prompt = f"""
Context/Instructions: {payload.context}

Original Email Details:
- From: {payload.sender}
- Subject: {payload.subject}
- Body: {payload.original_body[:1000] if payload.original_body else 'No body available'}...

Please draft a {payload.reply_type} that follows the user's instructions. 
Make it professional, appropriate, and actionable."""

        completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model="llama3-8b-8192",
            temperature=0.7,
            max_tokens=500
        )
        
        generated_body = completion.choices[0].message.content.strip()
        
        # Add signature/closing if not present
        if not any(closing in generated_body.lower() for closing in ['best regards', 'sincerely', 'thank you', 'thanks']):
            generated_body += "\n\nBest regards"
        
        return {
            "success": True,
            "generated_body": generated_body,
            "reply_type": payload.reply_type
        }
        
    except Exception as e:
        print(f"❌ Error generating email body: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate email body: {str(e)}")

@app.put("/api/update-email-status")
async def update_email_status_endpoint(
    payload: UpdateEmailStatusPayload,
    user_email: str = Query(..., description="User email for email ownership verification")
):
    """Update email status (read/replied) for a specific user"""
    print(f"Updating email status for {payload.email_id} (user: {user_email})")
    
    try:
        success = update_email_status(
            email_id=payload.email_id,
            user_email=user_email,
            is_read=payload.is_read,
            is_replied=payload.is_replied,
            reply_status=payload.reply_status
        )
        
        if success:
            return {"message": "Email status updated successfully"}
        else:
            raise HTTPException(status_code=404, detail="Email not found or no update needed.")
            
    except Exception as e:
        print(f"❌ Error updating email status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update email status: {str(e)}")

@app.post("/api/send-email")
async def send_email_endpoint(payload: SendEmailPayload):
    """Send email via Gmail API"""
    print(f"📤 Sending email to {payload.to}")
    
    if not payload.access_token:
        raise HTTPException(status_code=400, detail="Access token is missing.")
    
    try:
        response = send_email(
            access_token=payload.access_token,
            to=payload.to,
            subject=payload.subject,
            body=payload.body
        )
        
        return {
            "message": "Email sent successfully",
            "message_id": response.get("id"),
            "to": payload.to
        }
        
    except Exception as e:
        print(f"❌ Error sending email: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

@app.post("/api/load-older-emails")
async def load_older_emails(
    payload: TokenPayload,
    count: int = Query(50, le=100, description="Number of older emails to fetch")
):
    """Load older emails from Gmail using pagination"""
    print(f"📄 Loading {count} older emails for {payload.user_email}")
    
    if not payload.access_token:
        raise HTTPException(status_code=400, detail="Access token is missing.")
    
    try:
        # Get current sync metadata to find next page token
        sync_metadata = get_user_sync_metadata(str(payload.user_email))
        if not sync_metadata or not sync_metadata.get("next_page_token"):
            return {
                "message": "No more emails to load",
                "emails_loaded": 0,
                "has_more": False
            }
        
        # Fetch older emails using page token
        emails, next_page_token = get_older_emails(
            access_token=payload.access_token,
            page_token=sync_metadata["next_page_token"],
            count=count
        )
        
        # Store emails in database
        for email_data in emails:
            email_data = process_email_with_ai(email_data)
            insert_email_enhanced(email_data, str(payload.user_email))
        
        # Update sync metadata with new page token
        update_user_sync_metadata(
            user_email=str(payload.user_email),
            next_page_token=next_page_token,
            last_sync_timestamp=int(time.time())
        )
        
        return {
            "message": f"Successfully loaded {len(emails)} older emails",
            "emails_loaded": len(emails),
            "has_more": next_page_token is not None,
            "user_email": payload.user_email
        }
        
    except Exception as e:
        print(f"❌ Error loading older emails for {payload.user_email}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load older emails: {str(e)}")

@app.get("/api/email-thread/{thread_id}")
async def get_email_thread(
    thread_id: str,
    access_token: str = Query(..., description="Gmail access token")
):
    """Get all emails in a thread for better context"""
    print(f"📧 Fetching thread: {thread_id}")
    
    try:
        thread_data = get_gmail_thread(access_token, thread_id)
        return {
            "success": True,
            "thread": thread_data
        }
        
    except Exception as e:
        print(f"❌ Error fetching thread: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch thread: {str(e)}")

@app.post("/api/mark-email-important")
async def mark_email_important(
    email_id: str = Query(..., description="Email ID to mark as important"),
    access_token: str = Query(..., description="Gmail access token"),
    important: bool = Query(True, description="Mark as important or remove importance")
):
    """Mark email as important/unimportant in Gmail"""
    print(f"⭐ Marking email {email_id} as {'important' if important else 'not important'}")
    
    try:
        result = modify_gmail_labels(
            access_token=access_token,
            message_id=email_id,
            add_labels=["IMPORTANT"] if important else [],
            remove_labels=[] if important else ["IMPORTANT"]
        )
        
        return {
            "success": True,
            "message": f"Email marked as {'important' if important else 'not important'}",
            "result": result
        }
        
    except Exception as e:
        print(f"❌ Error marking email importance: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update email importance: {str(e)}")

@app.get("/api/email-analytics/{user_email}")
async def get_email_analytics(
    user_email: str,
    days: int = Query(30, description="Number of days to analyze")
):
    """Get email analytics for the user"""
    print(f"📊 Getting email analytics for {user_email} (last {days} days)")
    
    try:
        # Get emails from database for analytics
        emails = get_emails_from_db_enhanced(user_email=user_email, limit=1000)
        
        # Calculate analytics
        total_emails = len(emails)
        replied_emails = sum(1 for email in emails if email.get('is_replied', 0) == 1)
        negative_sentiment = sum(1 for email in emails if email.get('sentiment') == 'NEGATIVE')
        positive_sentiment = sum(1 for email in emails if email.get('sentiment') == 'POSITIVE')
        
        reply_rate = (replied_emails / total_emails * 100) if total_emails > 0 else 0
        negative_rate = (negative_sentiment / total_emails * 100) if total_emails > 0 else 0
        
        # Group by sender for top senders
        sender_counts = {}
        for email in emails:
            sender = email.get('from_address', 'Unknown')
            sender_counts[sender] = sender_counts.get(sender, 0) + 1
        
        top_senders = sorted(sender_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        
        return {
            "success": True,
            "analytics": {
                "total_emails": total_emails,
                "replied_emails": replied_emails,
                "reply_rate": round(reply_rate, 2),
                "sentiment_breakdown": {
                    "positive": positive_sentiment,
                    "negative": negative_sentiment,
                    "neutral": total_emails - positive_sentiment - negative_sentiment
                },
                "negative_rate": round(negative_rate, 2),
                "top_senders": top_senders
            },
            "period_days": days
        }
        
    except Exception as e:
        print(f"❌ Error getting email analytics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get analytics: {str(e)}")

@app.delete("/api/reset-user-data/{user_email}")
async def reset_user_data(user_email: str):
    """Reset all data for a user (for development/testing)"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Delete user emails
        cursor.execute("DELETE FROM emails WHERE user_email = ?", (user_email,))
        emails_deleted = cursor.rowcount
        
        # Delete user sync metadata
        cursor.execute("DELETE FROM user_sync_metadata WHERE user_email = ?", (user_email,))
        metadata_deleted = cursor.rowcount
        
        conn.commit()
        conn.close()
        
        print(f"🗑️ Reset data for user: {user_email} - {emails_deleted} emails, {metadata_deleted} metadata records")
        return {
            "message": f"All data reset for user {user_email}",
            "emails_deleted": emails_deleted,
            "metadata_deleted": metadata_deleted
        }
        
    except Exception as e:
        print(f"❌ Error resetting user data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to reset user data: {str(e)}")

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": int(time.time()),
        "groq_client_available": groq_client is not None
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)