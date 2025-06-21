# /home/rick110/RickDrive/email_automation/backend/database.py

import sqlite3
from typing import List, Dict, Optional
from datetime import datetime

DATABASE_URL = "emails.db"

def get_db_connection():
    conn = sqlite3.connect(DATABASE_URL)
    conn.row_factory = sqlite3.Row
    return conn

def create_tables():
    """Create all necessary tables including user-specific email storage and sync metadata"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Enhanced emails table with user_email field
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS emails (
            id TEXT,
            user_email TEXT NOT NULL,
            threadId TEXT,
            historyId TEXT,
            from_address TEXT NOT NULL,
            subject TEXT,
            snippet TEXT,
            internalDate INTEGER,
            sentiment TEXT DEFAULT 'N/A',
            reply_status TEXT DEFAULT 'Not Replied',
            suggested_reply_body TEXT,
            full_body TEXT,
            is_read INTEGER DEFAULT 0,
            is_replied INTEGER DEFAULT 0,
            labels TEXT, -- JSON array of Gmail labels
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id, user_email)
        );
    """)
    
    # Create index for faster user-specific queries
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_email_date 
        ON emails(user_email, internalDate DESC);
    """)
    
    # User sync metadata table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_sync_metadata (
            user_email TEXT PRIMARY KEY,
            total_emails_count INTEGER DEFAULT 0,
            last_sync_timestamp INTEGER,
            last_history_id TEXT,
            next_page_token TEXT,
            sync_status TEXT DEFAULT 'never_synced', -- 'syncing', 'synced', 'error', 'never_synced'
            latest_50_synced INTEGER DEFAULT 0, -- 1 if latest 50 are synced, 0 otherwise
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    conn.commit()
    conn.close()

def insert_email(email_data: Dict, user_email: str):
    """Insert or update email for a specific user"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if email already exists for this user
    cursor.execute(
        "SELECT id FROM emails WHERE id = ? AND user_email = ?", 
        (email_data['id'], user_email)
    )
    existing_email = cursor.fetchone()

    if existing_email:
        print(f"Email with ID {email_data['id']} already exists for user {user_email}. Updating...")
        cursor.execute("""
            UPDATE emails
            SET from_address = ?, subject = ?, snippet = ?, sentiment = ?,
                reply_status = ?, suggested_reply_body = ?, full_body = ?,
                is_read = ?, is_replied = ?, labels = ?, updated_at = CURRENT_TIMESTAMP
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
            email_data.get('labels', ''),
            email_data['id'],
            user_email
        ))
    else:
        print(f"Inserting new email with ID {email_data['id']} for user {user_email}...")
        cursor.execute("""
            INSERT INTO emails (id, user_email, threadId, historyId, from_address, subject, 
                               snippet, internalDate, sentiment, reply_status, suggested_reply_body, 
                               full_body, is_read, is_replied, labels)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            email_data['id'],
            user_email,
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
            email_data.get('labels', '')
        ))
    
    conn.commit()
    conn.close()

def get_emails_from_db(
    user_email: str,
    limit: int = 50,
    offset: int = 0,
    sentiment: Optional[str] = None,
    reply_status: Optional[str] = None,
    is_read: Optional[bool] = None,
    is_replied: Optional[bool] = None,
    email_id: Optional[str] = None
) -> List[Dict]:
    """Get emails for a specific user with pagination"""
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM emails WHERE user_email = ?"
    params = [user_email]

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

    query += " ORDER BY internalDate DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(query, params)
    emails = cursor.fetchall()
    conn.close()
    return [dict(email) for email in emails]

def get_user_email_count(user_email: str) -> int:
    """Get total email count for a user"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM emails WHERE user_email = ?", (user_email,))
    count = cursor.fetchone()[0]
    conn.close()
    return count

def update_user_sync_metadata(
    user_email: str,
    total_emails_count: Optional[int] = None,
    last_sync_timestamp: Optional[int] = None,
    last_history_id: Optional[str] = None,
    next_page_token: Optional[str] = None,
    sync_status: Optional[str] = None,
    latest_50_synced: Optional[bool] = None
):
    """Update or insert user sync metadata"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if user metadata exists
    cursor.execute("SELECT user_email FROM user_sync_metadata WHERE user_email = ?", (user_email,))
    exists = cursor.fetchone()
    
    if exists:
        # Update existing record
        update_fields = []
        params = []
        
        if total_emails_count is not None:
            update_fields.append("total_emails_count = ?")
            params.append(total_emails_count)
        if last_sync_timestamp is not None:
            update_fields.append("last_sync_timestamp = ?")
            params.append(last_sync_timestamp)
        if last_history_id is not None:
            update_fields.append("last_history_id = ?")
            params.append(last_history_id)
        if next_page_token is not None:
            update_fields.append("next_page_token = ?")
            params.append(next_page_token)
        if sync_status is not None:
            update_fields.append("sync_status = ?")
            params.append(sync_status)
        if latest_50_synced is not None:
            update_fields.append("latest_50_synced = ?")
            params.append(1 if latest_50_synced else 0)
            
        if update_fields:
            update_fields.append("updated_at = CURRENT_TIMESTAMP")
            query = f"UPDATE user_sync_metadata SET {', '.join(update_fields)} WHERE user_email = ?"
            params.append(user_email)
            cursor.execute(query, params)
    else:
        # Insert new record
        cursor.execute("""
            INSERT INTO user_sync_metadata 
            (user_email, total_emails_count, last_sync_timestamp, last_history_id, 
             next_page_token, sync_status, latest_50_synced)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            user_email,
            total_emails_count or 0,
            last_sync_timestamp,
            last_history_id,
            next_page_token,
            sync_status or 'never_synced',
            1 if latest_50_synced else 0
        ))
    
    conn.commit()
    conn.close()

def get_user_sync_metadata(user_email: str) -> Optional[Dict]:
    """Get user sync metadata"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM user_sync_metadata WHERE user_email = ?", (user_email,))
    result = cursor.fetchone()
    conn.close()
    return dict(result) if result else None

def update_email_status(
    email_id: str, 
    user_email: str,
    is_read: Optional[bool] = None, 
    is_replied: Optional[bool] = None, 
    reply_status: Optional[str] = None
):
    """Update email status for a specific user"""
    conn = get_db_connection()
    cursor = conn.cursor()
    update_fields = []
    params = []

    if is_read is not None:
        update_fields.append("is_read = ?")
        params.append(1 if is_read else 0)
    if is_replied is not None:
        update_fields.append("is_replied = ?")
        params.append(1 if is_replied else 0)
    if reply_status is not None:
        update_fields.append("reply_status = ?")
        params.append(reply_status)

    if not update_fields:
        conn.close()
        return False

    query = f"UPDATE emails SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?"
    params.extend([email_id, user_email])

    cursor.execute(query, params)
    conn.commit()
    rows_affected = cursor.rowcount
    conn.close()
    return rows_affected > 0

# Initialize tables when module is imported
create_tables()