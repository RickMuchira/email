# /home/rick110/RickDrive/email_automation/backend/main.py

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, EmailStr
from fastapi.middleware.cors import CORSMiddleware
import groq
import time
from typing import Optional

# Import enhanced database and Gmail reader functions
from database import (
    get_emails_from_db, insert_email, update_email_status, 
    get_user_email_count, update_user_sync_metadata, 
    get_user_sync_metadata, create_tables
)
from gmail_reader import (
    sync_latest_emails, get_older_emails, send_email, 
    get_gmail_profile, get_gmail_messages_batch
)

# --- Groq Client Initialization ---
GROQ_API_KEY = "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"

try:
    if not GROQ_API_KEY or GROQ_API_KEY == "YOUR_GROQ_API_KEY_HERE":
        print("🔴 FATAL: Groq API key is not set in the code.")
        groq_client = None
    else:
        groq_client = groq.Client(api_key=GROQ_API_KEY)
        print("✅ Groq client initialized successfully.")
except Exception as e:
    print(f"🔴 FATAL: Failed to initialize Groq client. Error: {e}")
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

@app.on_event("startup")
async def startup_event():
    """Ensure database tables exist on application startup"""
    create_tables()
    print("✅ Database tables ensured to exist.")

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

# --- API Endpoints ---
@app.get("/")
async def read_root():
    return {"message": "Enhanced FastAPI Email Automation Backend is running!"}

@app.post("/api/store-token")
async def store_token(payload: TokenPayload):
    """Store token and initialize user sync metadata if needed"""
    print(f"Received token for {payload.user_email}")
    
    # Initialize user sync metadata if doesn't exist
    sync_metadata = get_user_sync_metadata(payload.user_email)
    if not sync_metadata:
        update_user_sync_metadata(
            user_email=payload.user_email,
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
            user_email=payload.user_email,
            sync_status="syncing"
        )
        
        # Sync latest emails from Gmail
        emails, sync_metadata = sync_latest_emails(
            access_token=payload.access_token,
            user_email=payload.user_email,
            count=count
        )
        
        # Store emails in database
        for email_data in emails:
            insert_email(email_data, payload.user_email)
        
        # Update sync metadata
        update_user_sync_metadata(
            user_email=payload.user_email,
            total_emails_count=sync_metadata["total_emails_count"],
            last_sync_timestamp=sync_metadata["last_sync_timestamp"],
            sync_status=sync_metadata["sync_status"],
            latest_50_synced=sync_metadata["latest_50_synced"],
            next_page_token=sync_metadata.get("next_page_token")
        )
        
        print(f"✅ Successfully synced {len(emails)} emails for {payload.user_email}")
        
        return {
            "message": f"Successfully synced {len(emails)} latest emails",
            "emails_synced": len(emails),
            "total_emails_in_gmail": sync_metadata["total_emails_count"],
            "user_email": payload.user_email
        }
        
    except Exception as e:
        print(f"❌ Error syncing emails for {payload.user_email}: {e}")
        update_user_sync_metadata(
            user_email=payload.user_email,
            sync_status="error"
        )
        raise HTTPException(status_code=500, detail=f"Failed to sync emails: {str(e)}")

@app.post("/api/read-emails")
async def read_emails_and_process(
    payload: TokenPayload,
    email_id: str | None = Query(None, description="Optional email ID to fetch a specific email"),
    fetch_new: bool = Query(False, description="Whether to fetch new emails from Gmail"),
    limit: int = Query(50, description="Maximum number of emails to return"),
    offset: int = Query(0, description="Offset for pagination")
):
    """
    Read emails for a specific user with pagination support
    Now properly isolated per user
    """
    print(f"Processing /api/read-emails request for {payload.user_email}. Email ID: {email_id}, Fetch New: {fetch_new}, Limit: {limit}, Offset: {offset}")

    if not payload.access_token:
        raise HTTPException(status_code=400, detail="Access token is missing.")

    try:
        # If fetching new emails or specific email ID
        if fetch_new or email_id:
            if email_id:
                # Fetch specific email from Gmail
                emails_from_gmail, _ = get_gmail_messages_batch(
                    access_token=payload.access_token,
                    email_id=email_id
                )
                
                # Store/update in database
                for email_data in emails_from_gmail:
                    insert_email(email_data, payload.user_email)
            else:
                # Fetch latest emails (small batch for real-time updates)
                emails_from_gmail, next_page_token = get_gmail_messages_batch(
                    access_token=payload.access_token,
                    max_results=min(limit, 20),  # Limit real-time fetches
                    query="is:unread"  # Focus on unread emails for real-time
                )
                
                # Store/update in database
                for email_data in emails_from_gmail:
                    insert_email(email_data, payload.user_email)
                
                # Update sync metadata
                update_user_sync_metadata(
                    user_email=payload.user_email,
                    last_sync_timestamp=int(time.time()),
                    next_page_token=next_page_token
                )

        # Always return emails from database (user-specific)
        db_emails = get_emails_from_db(
            user_email=payload.user_email,
            limit=limit,
            offset=offset,
            email_id=email_id
        )

        if email_id and not db_emails:
            raise HTTPException(status_code=404, detail=f"Email with ID '{email_id}' not found.")

        # Get user sync status for response metadata
        sync_metadata = get_user_sync_metadata(payload.user_email)
        local_count = get_user_email_count(payload.user_email)

        return {
            "emails": db_emails,
            "total_count": local_count,
            "offset": offset,
            "limit": limit,
            "has_more": len(db_emails) == limit,
            "sync_status": sync_metadata.get("sync_status", "never_synced") if sync_metadata else "never_synced",
            "total_emails_in_gmail": sync_metadata.get("total_emails_count", 0) if sync_metadata else 0
        }

    except Exception as e:
        print(f"❌ Error reading emails for {payload.user_email}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to read emails: {str(e)}")

@app.post("/api/load-older-emails")
async def load_older_emails(
    payload: TokenPayload,
    count: int = Query(50, le=100, description="Number of older emails to fetch")
):
    """
    Load older emails from Gmail using pagination
    """
    print(f"📄 Loading {count} older emails for {payload.user_email}")
    
    if not payload.access_token:
        raise HTTPException(status_code=400, detail="Access token is missing.")
    
    try:
        # Get current sync metadata to find next page token
        sync_metadata = get_user_sync_metadata(payload.user_email)
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
            insert_email(email_data, payload.user_email)
        
        # Update sync metadata with new page token
        update_user_sync_metadata(
            user_email=payload.user_email,
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

@app.post("/api/generate-email-body")
async def generate_email_body(payload: GenerateEmailBodyRequest):
    """Generate email body using Groq AI"""
    print(f"🤖 Generating email body for {payload.user_email}")
    
    if not groq_client:
        raise HTTPException(status_code=500, detail="Groq client is not configured.")
    
    try:
        completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system", 
                    "content": "You are a helpful assistant that drafts professional email responses. Create clear, concise, and appropriate email content based on the user's context and the original email details."
                },
                {
                    "role": "user", 
                    "content": f"Draft an email response based on this context: {payload.context}\n\nOriginal sender: {payload.sender}\nOriginal subject: {payload.subject}\n\nPlease provide a professional and appropriate response."
                }
            ],
            model="llama3-8b-8192",
            temperature=0.7,
            max_tokens=1000
        )
        
        generated_body = completion.choices[0].message.content.strip()
        
        return {
            "message": "Email body generated successfully",
            "generated_body": generated_body,
            "user_email": payload.user_email
        }
        
    except Exception as e:
        print(f"❌ Error generating email body: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate email body: {str(e)}")

@app.delete("/api/reset-user-data/{user_email}")
async def reset_user_data(user_email: str):
    """Reset all data for a user (for development/testing)"""
    try:
        from database import get_db_connection
        
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