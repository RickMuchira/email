# /home/rick110/RickDrive/email_automation/backend/database.py

import sqlite3
from typing import List, Dict, Optional

DATABASE_URL = "emails.db" # This will create a file in your backend directory

def get_db_connection():
    conn = sqlite3.connect(DATABASE_URL)
    conn.row_factory = sqlite3.Row # This allows access to columns by name
    return conn

def create_email_table():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS emails (
            id TEXT PRIMARY KEY,
            threadId TEXT,
            historyId TEXT,
            from_address TEXT NOT NULL,
            subject TEXT,
            snippet TEXT,
            internalDate INTEGER,
            sentiment TEXT DEFAULT 'N/A', -- Kept for compatibility, but no longer populated by Groq
            reply_status TEXT DEFAULT 'Not Replied',
            suggested_reply_body TEXT, -- Kept for compatibility, but no longer populated by Groq
            full_body TEXT, -- To store the full email body when fetched
            is_read INTEGER DEFAULT 0, -- 0 for unread, 1 for read
            is_replied INTEGER DEFAULT 0, -- 0 for unreplied, 1 for replied
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    conn.close()

def insert_email(email_data: Dict):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Check if email already exists
    cursor.execute("SELECT id FROM emails WHERE id = ?", (email_data['id'],))
    existing_email = cursor.fetchone()

    if existing_email:
        print(f"Email with ID {email_data['id']} already exists. Updating...")
        cursor.execute("""
            UPDATE emails
            SET from_address = ?, subject = ?, snippet = ?, sentiment = ?,
                reply_status = ?, suggested_reply_body = ?, full_body = ?,
                is_read = ?, is_replied = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (
            email_data.get('from', ''),
            email_data.get('subject', ''),
            email_data.get('snippet', ''),
            email_data.get('sentiment', 'N/A'), # Will be 'N/A' now
            email_data.get('reply_status', 'Not Replied'),
            email_data.get('suggested_reply_body'), # Will be None now
            email_data.get('full_body'),
            int(email_data.get('is_read', 0)),
            int(email_data.get('is_replied', 0)),
            email_data['id']
        ))
    else:
        print(f"Inserting new email with ID {email_data['id']}...")
        cursor.execute("""
            INSERT INTO emails (id, threadId, historyId, from_address, subject, snippet, internalDate,
                                 sentiment, reply_status, suggested_reply_body, full_body, is_read, is_replied)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            email_data['id'],
            email_data.get('threadId'),
            email_data.get('historyId'),
            email_data.get('from', ''),
            email_data.get('subject', ''),
            email_data.get('snippet', ''),
            email_data.get('internalDate'),
            email_data.get('sentiment', 'N/A'), # Will be 'N/A' now
            email_data.get('reply_status', 'Not Replied'),
            email_data.get('suggested_reply_body'), # Will be None now
            email_data.get('full_body'),
            int(email_data.get('is_read', 0)),
            int(email_data.get('is_replied', 0))
        ))
    conn.commit()
    conn.close()

def get_emails_from_db(
    limit: int = 10,
    offset: int = 0,
    sentiment: Optional[str] = None, # Can still be used for filtering existing data
    reply_status: Optional[str] = None,
    is_read: Optional[bool] = None,
    is_replied: Optional[bool] = None,
    email_id: Optional[str] = None
) -> List[Dict]:
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM emails WHERE 1=1"
    params = []

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

def update_email_status(email_id: str, is_read: Optional[bool] = None, is_replied: Optional[bool] = None, reply_status: Optional[str] = None):
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
        return False # Nothing to update

    query = f"UPDATE emails SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    params.append(email_id)

    cursor.execute(query, params)
    conn.commit()
    rows_affected = cursor.rowcount
    conn.close()
    return rows_affected > 0

# Initialize the database table when this module is imported
create_email_table()