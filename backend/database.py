# /home/rick110/RickDrive/email_automation/backend/database.py

import sqlite3
from typing import List, Dict, Optional
import json
import time
from enhanced_sentiment_system import SENTIMENT_CATEGORIES, PRIORITY_LEVELS

DATABASE_URL = "emails.db"  # This will create a file in your backend directory

def get_db_connection():
    """Get database connection with row factory for named access"""
    conn = sqlite3.connect(DATABASE_URL)
    conn.row_factory = sqlite3.Row  # This allows access to columns by name
    return conn

def create_tables():
    """Create all necessary tables with proper schema"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create emails table with all required fields
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS emails (
            id TEXT PRIMARY KEY,
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
            user_email TEXT,
            labels TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    # Create user_sync_metadata table for tracking sync status
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_sync_metadata (
            user_email TEXT PRIMARY KEY,
            total_emails_count INTEGER DEFAULT 0,
            last_sync_timestamp INTEGER,
            next_page_token TEXT,
            sync_status TEXT DEFAULT 'never_synced',
            latest_50_synced BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    # Create indexes for better performance
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_user_email ON emails(user_email);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_sentiment ON emails(sentiment);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_reply_status ON emails(reply_status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_internal_date ON emails(internalDate);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_is_read ON emails(is_read);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_is_replied ON emails(is_replied);")
    
    conn.commit()
    conn.close()
    print("✅ Database tables created successfully")

def get_emails_from_db(
    user_email: str = None,
    limit: int = 10,
    offset: int = 0,
    sentiment: str = None,
    reply_status: str = None,
    is_read: bool = None,
    is_replied: bool = None,
    email_id: str = None
) -> List[Dict]:
    """Get emails from database with comprehensive filtering"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Build query dynamically based on parameters
    query = "SELECT * FROM emails WHERE 1=1"
    params = []

    # User filtering (most important for multi-user support)
    if user_email:
        query += " AND user_email = ?"
        params.append(user_email)
        
    # Specific email lookup
    if email_id:
        query += " AND id = ?"
        params.append(email_id)

    # Filter by sentiment
    if sentiment:
        query += " AND sentiment = ?"
        params.append(sentiment.upper())
        
    # Filter by reply status
    if reply_status:
        query += " AND reply_status = ?"
        params.append(reply_status)
        
    # Filter by read status
    if is_read is not None:
        query += " AND is_read = ?"
        params.append(1 if is_read else 0)
        
    # Filter by replied status
    if is_replied is not None:
        query += " AND is_replied = ?"
        params.append(1 if is_replied else 0)

    # Order by most recent first
    query += " ORDER BY internalDate DESC"
    
    # Add pagination (only if not searching for specific email)
    if not email_id:
        query += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

    try:
        cursor.execute(query, params)
        rows = cursor.fetchall()
        # Convert rows to dictionaries for easier handling
        emails = [dict(row) for row in rows]
        conn.close()
        
        print(f"📊 Database query returned {len(emails)} emails for user: {user_email}")
        return emails
        
    except Exception as e:
        conn.close()
        print(f"❌ Database query error: {e}")
        return []

def insert_email(email_data: Dict, user_email: str = None):
    """Insert or update email with comprehensive error handling"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Ensure user_email is set
        if user_email:
            email_data['user_email'] = user_email
        elif not email_data.get('user_email'):
            print("⚠️ Warning: No user_email provided for email insertion")
            email_data['user_email'] = 'unknown'
        
        # Check if email already exists for this user
        cursor.execute("SELECT id FROM emails WHERE id = ? AND user_email = ?", 
                       (email_data['id'], email_data.get('user_email')))
        existing_email = cursor.fetchone()

        if existing_email:
            print(f"📝 Updating existing email {email_data['id']} for user {email_data.get('user_email')}")
            # Update existing email with all fields
            cursor.execute("""
                UPDATE emails
                SET from_address = ?, subject = ?, snippet = ?, sentiment = ?,
                    reply_status = ?, suggested_reply_body = ?, full_body = ?,
                    is_read = ?, is_replied = ?, threadId = ?, historyId = ?,
                    internalDate = ?, labels = ?, updated_at = CURRENT_TIMESTAMP
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
                email_data.get('threadId'),
                email_data.get('historyId'),
                email_data.get('internalDate'),
                email_data.get('labels'),
                email_data['id'],
                email_data.get('user_email')
            ))
        else:
            print(f"📥 Inserting new email {email_data['id']} for user {email_data.get('user_email')}")
            # Insert new email with all fields
            cursor.execute("""
                INSERT INTO emails (id, threadId, historyId, from_address, subject, snippet, 
                                  internalDate, sentiment, reply_status, suggested_reply_body, 
                                  full_body, is_read, is_replied, user_email, labels)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                email_data.get('user_email'),
                email_data.get('labels')
            ))
        
        conn.commit()
        print(f"✅ Email {email_data['id']} saved successfully")
        
    except Exception as e:
        print(f"❌ Error saving email {email_data.get('id', 'unknown')}: {e}")
        conn.rollback()
    finally:
        conn.close()

def update_email_status(
    email_id: str,
    user_email: str,
    is_read: bool = None,
    is_replied: bool = None,
    reply_status: str = None
) -> bool:
    """Update email status with user verification"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Verify email exists for this user
        cursor.execute("SELECT id FROM emails WHERE id = ? AND user_email = ?", 
                       (email_id, user_email))
        if not cursor.fetchone():
            print(f"⚠️ Email {email_id} not found for user {user_email}")
            conn.close()
            return False
        
        # Build dynamic update query
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
            print("⚠️ No fields to update")
            conn.close()
            return False
        
        # Add timestamp update
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        params.extend([email_id, user_email])
        
        # Execute update
        query = f"UPDATE emails SET {', '.join(update_fields)} WHERE id = ? AND user_email = ?"
        cursor.execute(query, params)
        
        success = cursor.rowcount > 0
        conn.commit()
        
        if success:
            print(f"✅ Email {email_id} status updated for user {user_email}")
        else:
            print(f"⚠️ No changes made to email {email_id}")
            
        return success
        
    except Exception as e:
        print(f"❌ Error updating email status: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def get_user_email_count(user_email: str) -> int:
    """Get total email count for a specific user"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT COUNT(*) FROM emails WHERE user_email = ?", (user_email,))
        count = cursor.fetchone()[0]
        print(f"📊 User {user_email} has {count} emails in database")
        return count
    except Exception as e:
        print(f"❌ Error getting email count for user {user_email}: {e}")
        return 0
    finally:
        conn.close()

def get_user_sync_metadata(user_email: str) -> Optional[Dict]:
    """Get sync metadata for a specific user"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM user_sync_metadata WHERE user_email = ?", (user_email,))
        row = cursor.fetchone()
        
        if row:
            metadata = dict(row)
            print(f"📊 Retrieved sync metadata for {user_email}: {metadata.get('sync_status')}")
            return metadata
        else:
            print(f"📊 No sync metadata found for {user_email}")
            return None
            
    except Exception as e:
        print(f"❌ Error getting sync metadata for {user_email}: {e}")
        return None
    finally:
        conn.close()

def update_user_sync_metadata(
    user_email: str,
    total_emails_count: int = None,
    last_sync_timestamp: int = None,
    next_page_token: str = None,
    sync_status: str = None,
    latest_50_synced: bool = None
):
    """Update or insert user sync metadata"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Convert dicts to JSON strings if needed
        if isinstance(next_page_token, dict):
            next_page_token = json.dumps(next_page_token)
        if isinstance(sync_status, dict):
            sync_status = json.dumps(sync_status)
        
        # Check if record exists
        cursor.execute("SELECT user_email FROM user_sync_metadata WHERE user_email = ?", 
                       (user_email,))
        exists = cursor.fetchone()
        
        if exists:
            # Update existing record with only provided values
            update_fields = []
            params = []
            
            if total_emails_count is not None:
                update_fields.append("total_emails_count = ?")
                params.append(total_emails_count)
                
            if last_sync_timestamp is not None:
                update_fields.append("last_sync_timestamp = ?")
                params.append(last_sync_timestamp)
                
            if next_page_token is not None:
                update_fields.append("next_page_token = ?")
                params.append(next_page_token)
                
            if sync_status is not None:
                update_fields.append("sync_status = ?")
                params.append(sync_status)
                
            if latest_50_synced is not None:
                update_fields.append("latest_50_synced = ?")
                params.append(latest_50_synced)
            
            if update_fields:
                update_fields.append("updated_at = CURRENT_TIMESTAMP")
                params.append(user_email)
                
                query = f"UPDATE user_sync_metadata SET {', '.join(update_fields)} WHERE user_email = ?"
                cursor.execute(query, params)
                print(f"📝 Updated sync metadata for {user_email}")
        else:
            # Insert new record with default values for missing fields
            cursor.execute("""
                INSERT INTO user_sync_metadata 
                (user_email, total_emails_count, last_sync_timestamp, next_page_token, 
                 sync_status, latest_50_synced)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                user_email,
                total_emails_count or 0,
                last_sync_timestamp,
                next_page_token,
                sync_status or 'never_synced',
                latest_50_synced or False
            ))
            print(f"📥 Created sync metadata for {user_email}")
        
        conn.commit()
        
    except Exception as e:
        print(f"❌ Error updating sync metadata for {user_email}: {e}")
        conn.rollback()
    finally:
        conn.close()

def delete_user_emails(user_email: str) -> int:
    """Delete all emails for a specific user (for testing/cleanup)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("DELETE FROM emails WHERE user_email = ?", (user_email,))
        deleted_count = cursor.rowcount
        conn.commit()
        
        print(f"🗑️ Deleted {deleted_count} emails for user {user_email}")
        return deleted_count
        
    except Exception as e:
        print(f"❌ Error deleting emails for user {user_email}: {e}")
        conn.rollback()
        return 0
    finally:
        conn.close()

def delete_user_sync_metadata(user_email: str) -> bool:
    """Delete sync metadata for a specific user"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("DELETE FROM user_sync_metadata WHERE user_email = ?", (user_email,))
        deleted = cursor.rowcount > 0
        conn.commit()
        
        if deleted:
            print(f"🗑️ Deleted sync metadata for user {user_email}")
        else:
            print(f"⚠️ No sync metadata found for user {user_email}")
            
        return deleted
        
    except Exception as e:
        print(f"❌ Error deleting sync metadata for user {user_email}: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def get_database_stats() -> Dict:
    """Get overall database statistics"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get total emails count
        cursor.execute("SELECT COUNT(*) FROM emails")
        total_emails = cursor.fetchone()[0]
        
        # Get unique users count
        cursor.execute("SELECT COUNT(DISTINCT user_email) FROM emails WHERE user_email IS NOT NULL")
        unique_users = cursor.fetchone()[0]
        
        # Get emails by sentiment
        cursor.execute("""
            SELECT sentiment, COUNT(*) as count 
            FROM emails 
            GROUP BY sentiment
        """)
        sentiment_stats = dict(cursor.fetchall())
        
        # Get emails by reply status
        cursor.execute("""
            SELECT reply_status, COUNT(*) as count 
            FROM emails 
            GROUP BY reply_status
        """)
        reply_stats = dict(cursor.fetchall())
        
        stats = {
            "total_emails": total_emails,
            "unique_users": unique_users,
            "sentiment_breakdown": sentiment_stats,
            "reply_status_breakdown": reply_stats
        }
        
        print(f"📊 Database stats: {stats}")
        return stats
        
    except Exception as e:
        print(f"❌ Error getting database stats: {e}")
        return {}
    finally:
        conn.close()

def cleanup_old_emails(days_old: int = 30) -> int:
    """Clean up emails older than specified days (for maintenance)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Calculate timestamp for cutoff (30 days ago)
        cutoff_timestamp = int(time.time() - (days_old * 24 * 60 * 60)) * 1000  # Convert to milliseconds
        
        cursor.execute("""
            DELETE FROM emails 
            WHERE internalDate < ? AND is_replied = 1
        """, (cutoff_timestamp,))
        
        deleted_count = cursor.rowcount
        conn.commit()
        
        print(f"🧹 Cleaned up {deleted_count} old emails (older than {days_old} days)")
        return deleted_count
        
    except Exception as e:
        print(f"❌ Error cleaning up old emails: {e}")
        conn.rollback()
        return 0
    finally:
        conn.close()

# Utility function for database health check
def check_database_health() -> bool:
    """Check if database is accessible and tables exist"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if main tables exist
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name IN ('emails', 'user_sync_metadata')
        """)
        tables = [row[0] for row in cursor.fetchall()]
        
        required_tables = ['emails', 'user_sync_metadata']
        missing_tables = [table for table in required_tables if table not in tables]
        
        if missing_tables:
            print(f"⚠️ Missing database tables: {missing_tables}")
            conn.close()
            return False
        
        # Test basic operations
        cursor.execute("SELECT COUNT(*) FROM emails LIMIT 1")
        cursor.execute("SELECT COUNT(*) FROM user_sync_metadata LIMIT 1")
        
        conn.close()
        print("✅ Database health check passed")
        return True
        
    except Exception as e:
        print(f"❌ Database health check failed: {e}")
        return False

def update_database_schema_for_enhanced_sentiment():
    """Update database schema to support enhanced sentiment analysis"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        print("🔧 Updating database schema for enhanced sentiment analysis...")
        cursor.execute("PRAGMA table_info(emails)")
        existing_columns = [column[1] for column in cursor.fetchall()]
        new_columns = [
            ("sentiment_display", "TEXT DEFAULT 'N/A'"),
            ("priority_level", "INTEGER DEFAULT 5"),
            ("priority_name", "TEXT DEFAULT 'Very Low'"),
            ("confidence", "INTEGER DEFAULT 0"),
            ("requires_immediate_attention", "BOOLEAN DEFAULT FALSE"),
            ("analysis_details", "TEXT DEFAULT '{}'"),
            ("auto_reply_suggested", "BOOLEAN DEFAULT FALSE")
        ]
        for column_name, column_definition in new_columns:
            if column_name not in existing_columns:
                print(f"📝 Adding column: {column_name}")
                cursor.execute(f"ALTER TABLE emails ADD COLUMN {column_name} {column_definition}")
        indexes = [
            "CREATE INDEX IF NOT EXISTS idx_emails_priority_level ON emails(priority_level);",
            "CREATE INDEX IF NOT EXISTS idx_emails_immediate_attention ON emails(requires_immediate_attention);",
            "CREATE INDEX IF NOT EXISTS idx_emails_priority_user ON emails(priority_level, user_email);",
            "CREATE INDEX IF NOT EXISTS idx_emails_sentiment_priority ON emails(sentiment, priority_level);"
        ]
        for index_sql in indexes:
            cursor.execute(index_sql)
            print(f"📊 Created index: {index_sql.split('idx_')[1].split(' ')[0]}")
        cursor.execute("""
            CREATE VIEW IF NOT EXISTS priority_emails AS
            SELECT 
                id, user_email, from_address, subject, snippet, sentiment, 
                sentiment_display, priority_level, priority_name, 
                requires_immediate_attention, internalDate, is_read, is_replied,
                suggested_reply_body, reply_status
            FROM emails 
            WHERE priority_level <= 3 
            ORDER BY priority_level ASC, internalDate DESC
        """)
        print("📋 Created priority_emails view")
        conn.commit()
        print("✅ Database schema update completed successfully")
    except Exception as e:
        print(f"❌ Database schema update failed: {e}")
        conn.rollback()
    finally:
        conn.close()

def get_priority_emails(user_email: str, priority_threshold: int = 3) -> List[Dict]:
    """Get high-priority emails for a user"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT * FROM emails 
            WHERE user_email = ? AND priority_level <= ?
            ORDER BY priority_level ASC, internalDate DESC
            LIMIT 20
        """, (user_email, priority_threshold))
        rows = cursor.fetchall()
        emails = [dict(row) for row in rows]
        print(f"🚨 Found {len(emails)} high-priority emails for {user_email}")
        return emails
    except Exception as e:
        print(f"❌ Error fetching priority emails: {e}")
        return []
    finally:
        conn.close()

def get_emails_by_sentiment_category(user_email: str, categories: List[str]) -> List[Dict]:
    """Get emails filtered by sentiment categories"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        placeholders = ','.join(['?' for _ in categories])
        query = f"""
            SELECT * FROM emails 
            WHERE user_email = ? AND sentiment IN ({placeholders})
            ORDER BY priority_level ASC, internalDate DESC
        """
        cursor.execute(query, [user_email] + categories)
        rows = cursor.fetchall()
        emails = [dict(row) for row in rows]
        print(f"📊 Found {len(emails)} emails in categories {categories} for {user_email}")
        return emails
    except Exception as e:
        print(f"❌ Error fetching emails by sentiment: {e}")
        return []
    finally:
        conn.close()

def get_sentiment_analytics(user_email: str) -> Dict:
    """Get detailed sentiment analytics for a user"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT sentiment, sentiment_display, COUNT(*) as count,
                   AVG(priority_level) as avg_priority,
                   SUM(CASE WHEN requires_immediate_attention = 1 THEN 1 ELSE 0 END) as urgent_count
            FROM emails 
            WHERE user_email = ?
            GROUP BY sentiment, sentiment_display
            ORDER BY count DESC
        """, (user_email,))
        sentiment_distribution = [dict(row) for row in cursor.fetchall()]
        cursor.execute("""
            SELECT priority_level, priority_name, COUNT(*) as count
            FROM emails 
            WHERE user_email = ?
            GROUP BY priority_level, priority_name
            ORDER BY priority_level ASC
        """, (user_email,))
        priority_distribution = [dict(row) for row in cursor.fetchall()]
        cursor.execute("""
            SELECT COUNT(*) as urgent_count
            FROM emails 
            WHERE user_email = ? AND requires_immediate_attention = 1 AND is_replied = 0
        """, (user_email,))
        urgent_unreplied = cursor.fetchone()[0]
        cursor.execute("""
            SELECT 
                AVG(CASE WHEN priority_level <= 2 THEN 
                    (julianday('now') - julianday(datetime(internalDate/1000, 'unixepoch'))) * 24 
                END) as avg_high_priority_response_hours,
                COUNT(CASE WHEN priority_level <= 2 AND is_replied = 0 THEN 1 END) as high_priority_pending
            FROM emails 
            WHERE user_email = ?
        """, (user_email,))
        response_analytics = dict(cursor.fetchone())
        analytics = {
            "sentiment_distribution": sentiment_distribution,
            "priority_distribution": priority_distribution,
            "urgent_unreplied": urgent_unreplied,
            "response_analytics": response_analytics,
            "total_emails": sum(item["count"] for item in sentiment_distribution)
        }
        print(f"📈 Generated sentiment analytics for {user_email}")
        return analytics
    except Exception as e:
        print(f"❌ Error generating sentiment analytics: {e}")
        return {}
    finally:
        conn.close()

def migrate_existing_sentiment_data():
    """Migrate existing POSITIVE/NEGATIVE/NEUTRAL data to new categories"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        print("🔄 Migrating existing sentiment data...")
        migration_map = {
            'POSITIVE': 'APPRECIATION',
            'NEGATIVE': 'COMPLAINT', 
            'NEUTRAL': 'INFORMATIONAL',
            'N/A': 'INFORMATIONAL'
        }
        for old_sentiment, new_category in migration_map.items():
            category_info = SENTIMENT_CATEGORIES.get(new_category, {})
            cursor.execute("""
                UPDATE emails 
                SET sentiment = ?, 
                    sentiment_display = ?,
                    priority_level = ?,
                    priority_name = ?,
                    requires_immediate_attention = ?
                WHERE sentiment = ?
            """, (
                new_category,
                category_info.get('display_name', new_category),
                category_info.get('priority', 5),
                'Medium' if category_info.get('priority', 5) == 3 else 'Low',
                int(category_info.get('priority', 5) <= 2),
                old_sentiment
            ))
            updated_count = cursor.rowcount
            print(f"📝 Migrated {updated_count} emails from {old_sentiment} to {new_category}")
        conn.commit()
        print("✅ Sentiment data migration completed")
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

def initialize_enhanced_sentiment_system():
    """Initialize the enhanced sentiment system"""
    try:
        print("🚀 Initializing Enhanced Sentiment System...")
        update_database_schema_for_enhanced_sentiment()
        migrate_existing_sentiment_data()
        print("✅ Enhanced Sentiment System initialized successfully!")
        return True
    except Exception as e:
        print(f"❌ Failed to initialize enhanced sentiment system: {e}")
        return False

# Initialize database on import
if __name__ == "__main__":
    print("🔧 Initializing database...")
    create_tables()
    health_ok = check_database_health()
    if health_ok:
        stats = get_database_stats()
        print(f"📊 Database ready with {stats.get('total_emails', 0)} emails for {stats.get('unique_users', 0)} users")
    else:
        print("❌ Database initialization failed")