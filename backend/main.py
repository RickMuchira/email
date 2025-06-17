# /home/rick110/RickDrive/email_automation/backend/main.py

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, EmailStr
from fastapi.middleware.cors import CORSMiddleware
import groq # Ensure this is installed: pip install groq
import re # Needed for post-processing AI generated text

# Import your database and Gmail reader functions
from database import get_emails_from_db, insert_email, update_email_status, create_email_table
from gmail_reader import get_gmail_messages, send_email

# --- Groq Client Initialization ---
# WARNING: Hardcoding API keys is a security risk. Use environment variables in production.
GROQ_API_KEY = "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" 

try:
    if not GROQ_API_KEY or GROQ_API_KEY == "YOUR_GROQ_API_KEY_HERE":
        print("🔴 FATAL: Groq API key is not set in the code or is a placeholder. Please replace 'YOUR_GROQ_API_KEY_HERE'.")
        groq_client = None
    else:
        groq_client = groq.Client(api_key=GROQ_API_KEY)
        print("✅ Groq client initialized successfully.")
except Exception as e:
    print(f"🔴 FATAL: Failed to initialize Groq client. Error: {e}")
    groq_client = None

app = FastAPI()

# --- CORS Middleware ---
origins = [
    "http://localhost:3000", # Your Next.js frontend
    # Add any other origins your frontend might be hosted on
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """
    Ensure the database table exists on application startup.
    """
    create_email_table()
    print("✅ Database table ensured to exist.")


# --- Pydantic Models ---
class TokenPayload(BaseModel):
    access_token: str
    refresh_token: str | None = None
    user_email: EmailStr # Use EmailStr for email validation

class SendEmailPayload(BaseModel):
    access_token: str
    to: EmailStr
    subject: str
    body: str
    original_message_id: str | None = None

class MarkEmailReadPayload(BaseModel):
    email_id: str
    access_token: str # Retained for potential future use or consistency

class UpdateEmailStatusPayload(BaseModel):
    email_id: str
    is_read: bool | None = None
    is_replied: bool | None = None
    reply_status: str | None = None

# --- NEW Model for Groq Body Generation Request ---
class GenerateEmailBodyRequest(BaseModel):
    access_token: str # Still pass token for frontend consistency and potential backend auth check
    user_email: EmailStr
    context: str # The user's prompt or context for generating the email
    sender: EmailStr # Original sender's email
    subject: str # Original email subject


# --- API Endpoints ---
@app.get("/")
async def read_root():
    """
    Basic health check endpoint.
    """
    return {"message": "FastAPI Backend is running!"}

@app.post("/api/store-token")
async def store_token(payload: TokenPayload):
    """
    Receives and acknowledges user tokens.
    In a real app, you would securely store these tokens associated with a user.
    """
    print(f"Received token for {payload.user_email}. (Token not persistently stored in this example backend)")
    return {"message": "Token received successfully on backend!", "email": payload.user_email}

@app.post("/api/read-emails")
async def read_emails_and_process(
    payload: TokenPayload,
    email_id: str | None = Query(None, description="Optional email ID to fetch a specific email"),
    fetch_new: bool = Query(True, description="Whether to fetch new emails from Gmail or rely on database only"),
    limit: int = Query(10, description="Maximum number of emails to return")
):
    """
    Fetches emails from Gmail (if requested) and/or the local database.
    Does NOT perform sentiment analysis or generate suggested replies via Groq.
    """
    print(f"Processing /api/read-emails request. Email ID: {email_id}, Fetch New: {fetch_new}, Limit: {limit}")

    if not payload.access_token:
        raise HTTPException(status_code=400, detail="Access token is missing.")
    
    retrieved_emails_from_gmail = []
    
    # Fetch from Gmail if 'fetch_new' is true, or if a specific email_id is requested (to ensure latest data)
    if fetch_new or email_id:
        try:
            # Query for unread messages when listing. When fetching by ID, no search query is needed.
            gmail_query = "is:unread" if not email_id else None 
            
            emails_from_gmail = get_gmail_messages(
                payload.access_token,
                max_results=20, # Keep fetching max 20 unread for initial sync
                email_id=email_id,
                query=gmail_query
            )
            retrieved_emails_from_gmail = emails_from_gmail

            # Store/update fetched emails in the database
            for email_data in emails_from_gmail:
                # Initialize default values. Sentiment and suggested_reply_body are no longer generated.
                email_data['sentiment'] = 'N/A' # Will always be N/A now
                email_data['reply_status'] = email_data.get('reply_status', 'Not Replied')
                email_data['is_read'] = 0 # Mark as unread initially (unless specifically fetched email is already read)
                email_data['is_replied'] = 0 # Mark as unreplied initially
                email_data['suggested_reply_body'] = None # No longer generated
                insert_email(email_data) # Insert or update

        except Exception as e:
            print(f"❌ Error fetching emails from Gmail: {e}")
            # Do not raise HTTPException here, allow proceeding with DB emails
            # This allows the app to function even if Gmail API calls fail temporarily
    
    # --- Logic for returning emails ---
    if email_id:
        # If a specific email_id is requested, fetch and return only that one from DB
        db_emails = get_emails_from_db(email_id=email_id)
        if not db_emails:
            # If specific email not found in DB even after trying Gmail fetch, raise 404
            raise HTTPException(status_code=404, detail=f"Email with ID '{email_id}' not found in database.")
        
        email_to_return = db_emails[0]
        # Sentiment and suggested_reply_body are not processed here
        return {"email": {
            "id": email_to_return["id"],
            "from": email_to_return["from_address"],
            "subject": email_to_return["subject"],
            "snippet": email_to_return["snippet"],
            "sentiment": email_to_return.get("sentiment", "N/A"), # Still returned, but will be 'N/A'
            "reply_status": email_to_return["reply_status"],
            "suggested_reply_body": email_to_return.get("suggested_reply_body"), # Will be None
            "full_body": email_to_return["full_body"]
        }}
        
    else: 
        # If no specific email_id, return a list of unread/unreplied emails from DB based on filters
        final_emails_to_return = get_emails_from_db(limit=limit, is_read=False, is_replied=False)
        
        # Map DB column names to frontend expected names
        formatted_emails = [
            {
                "id": email["id"],
                "from": email["from_address"],
                "subject": email["subject"],
                "snippet": email["snippet"],
                "sentiment": email.get("sentiment", "N/A"), # Still returned, but will be 'N/A'
                "reply_status": email["reply_status"],
                "suggested_reply_body": email.get("suggested_reply_body"), # Will be None
                "full_body": email["full_body"]
            } for email in final_emails_to_return
        ]

        return {"emails": formatted_emails}


@app.post("/api/send-manual-email")
async def send_manual_email_route(payload: SendEmailPayload):
    """
    Sends an email using the Gmail API via `gmail_reader.py`.
    Marks the original email as replied in the database if an `original_message_id` is provided.
    """
    print(f"➡️ Manually sending email to {payload.to}")
    if not all([payload.access_token, payload.to, payload.subject, payload.body]):
        raise HTTPException(status_code=400, detail="Missing required fields for sending an email.")

    try:
        result = send_email(payload.access_token, payload.to, payload.subject, payload.body)
        print("✅ Manual email sent. Message ID:", result.get("id"))

        if payload.original_message_id:
            # Mark the original email as replied if a message ID was provided
            update_email_status(payload.original_message_id, is_replied=True, reply_status="User Replied")
            print(f"Marked email {payload.original_message_id} as replied in DB.")

        return {"success": True, "messageId": result.get("id")}
    except Exception as e:
        print(f"❌ Error in /api/send-manual-email endpoint: {e}")
        error_message = str(e)
        if "invalid_grant" in error_message.lower() or "auth" in error_message.lower() or "token" in error_message.lower():
            raise HTTPException(status_code=401, detail="Authentication error. The token may have expired. Please sign in again.")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {error_message}")


@app.post("/api/mark-email-read")
async def mark_email_read(payload: MarkEmailReadPayload):
    """
    Marks an email as read in the local database.
    """
    print(f"Attempting to mark email {payload.email_id} as read...")
    try:
        success = update_email_status(payload.email_id, is_read=True)
        if success:
            return {"success": True, "message": f"Email {payload.email_id} marked as read."}
        else:
            raise HTTPException(status_code=404, detail="Email not found or no update needed.")
    except Exception as e:
        print(f"❌ Error marking email as read: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to mark email as read: {str(e)}")

@app.post("/api/update-email-status")
async def api_update_email_status(payload: UpdateEmailStatusPayload):
    """
    Updates the read, replied, or reply status of an email in the local database.
    """
    print(f"Attempting to update status for email {payload.email_id} with is_read={payload.is_read}, is_replied={payload.is_replied}, reply_status={payload.reply_status}...")
    try:
        success = update_email_status(
            payload.email_id,
            is_read=payload.is_read,
            is_replied=payload.is_replied,
            reply_status=payload.reply_status
        )
        if success:
            return {"success": True, "message": f"Email {payload.email_id} status updated."}
        else:
            raise HTTPException(status_code=404, detail="Email not found or no update needed.")
    except Exception as e:
        print(f"❌ Error updating email status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update email status: {str(e)}")


# --- NEW Endpoint for Groq AI Body Generation ---
@app.post("/api/generate-email-body")
async def generate_email_body(request: GenerateEmailBodyRequest):
    """
    Generates an email body using Groq AI based on the provided context, sender, and subject.
    """
    if not groq_client:
        raise HTTPException(status_code=500, detail="Groq client is not configured on the server. Check the API key initialization.")
    
    # You might want to add more robust authentication/authorization checks here
    # beyond just having an access token. For this example, we assume presence
    # of access_token implies frontend authentication is handled.

    try:
        # Construct the prompt for Groq
        prompt_messages = [
            {
                "role": "system",
                "content": (
                    "You are an AI assistant designed to help compose professional email replies or new emails. "
                    "Focus on generating a concise, clear, and contextually appropriate email body. "
                    "Do not include subject lines, 'To:', 'From:', salutations like 'Dear/Hi [Name]', or closings like 'Sincerely/Best regards, [Your Name]'. "
                    "Just provide the main body content of the email."
                )
            },
            {
                "role": "user",
                "content": (
                    f"Compose an email. The original sender was: {request.sender}. "
                    f"The original email subject was: {request.subject}. "
                    f"The core context/instruction for this new email/reply is: {request.context}"
                )
            }
        ]

        # Call Groq API for chat completion
        chat_completion = groq_client.chat.completions.create(
            messages=prompt_messages,
            model="llama3-8b-8192", # You can choose other models available on Groq (e.g., "mixtral-8x7b-32768")
            temperature=0.7, # Adjust creativity (0.0 for deterministic, 1.0 for more creative)
            max_tokens=500, # Limit the length of the generated body to avoid overly long responses
        )

        generated_body = chat_completion.choices[0].message.content.strip()

        # Post-processing: Remove common salutations/closings if the model occasionally adds them
        generated_body = re.sub(r"^(Dear|Hi|Hello)\s+[^,\n]+[,!\.]?\s*\n*", "", generated_body, flags=re.IGNORECASE)
        generated_body = re.sub(r"\n*(Sincerely|Best regards|Thanks|Regards|Cheers)[,!\.]?\s*\[?Your Name\]?\s*$", "", generated_body, flags=re.IGNORECASE)
        generated_body = generated_body.strip()


        return {"success": True, "generated_body": generated_body}

    except Exception as e:
        print(f"❌ Error generating email body: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate email body: {str(e)}")

