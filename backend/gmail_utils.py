# gmail_utils.py
# Enhanced Gmail API utilities with proper email protocols

import base64
import email
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import requests
import json
from typing import Optional, List, Dict, Any
import re
from datetime import datetime

class GmailAPIHandler:
    """Enhanced Gmail API handler with proper email protocols"""
    
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.base_url = "https://gmail.googleapis.com/gmail/v1/users/me"
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
    
    def create_message_with_headers(
        self,
        to: str,
        subject: str,
        body: str,
        cc: Optional[str] = None,
        bcc: Optional[str] = None,
        in_reply_to: Optional[str] = None,
        references: Optional[str] = None,
        thread_id: Optional[str] = None,
        priority: str = "normal",
        html_body: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a properly formatted email message with Gmail-compliant headers
        """
        
        # Create multipart message if HTML body is provided
        if html_body:
            msg = MIMEMultipart('alternative')
            text_part = MIMEText(body, 'plain', 'utf-8')
            html_part = MIMEText(html_body, 'html', 'utf-8')
            msg.attach(text_part)
            msg.attach(html_part)
        else:
            msg = MIMEText(body, 'plain', 'utf-8')
        
        # Set basic headers
        msg['To'] = to
        msg['Subject'] = subject
        
        # Add CC and BCC
        if cc:
            msg['Cc'] = cc
        if bcc:
            msg['Bcc'] = bcc
        
        # Add threading headers for proper conversation handling
        if in_reply_to:
            msg['In-Reply-To'] = in_reply_to
        if references:
            msg['References'] = references
        
        # Add priority headers
        if priority == "high":
            msg['X-Priority'] = '1'
            msg['X-MSMail-Priority'] = 'High'
            msg['Importance'] = 'High'
        elif priority == "low":
            msg['X-Priority'] = '5'
            msg['X-MSMail-Priority'] = 'Low'
            msg['Importance'] = 'Low'
        
        # Add standard headers
        msg['Date'] = email.utils.formatdate(localtime=True)
        msg['Message-ID'] = email.utils.make_msgid()
        
        # Convert to raw format
        raw_message = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')
        
        message_data = {"raw": raw_message}
        if thread_id:
            message_data["threadId"] = thread_id
        
        return message_data
    
    def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        **kwargs
    ) -> Dict[str, Any]:
        """Send email with proper headers"""
        
        try:
            message_data = self.create_message_with_headers(
                to=to,
                subject=subject,
                body=body,
                **kwargs
            )
            
            response = requests.post(
                f"{self.base_url}/messages/send",
                headers=self.headers,
                json=message_data
            )
            
            if response.status_code != 200:
                raise Exception(f"Gmail API error: {response.status_code} - {response.text}")
            
            return response.json()
            
        except Exception as e:
            raise Exception(f"Failed to send email: {str(e)}")
    
    def get_message_details(self, message_id: str, format: str = "full") -> Dict[str, Any]:
        """Get detailed message information including headers"""
        
        try:
            response = requests.get(
                f"{self.base_url}/messages/{message_id}",
                headers=self.headers,
                params={"format": format}
            )
            
            if response.status_code != 200:
                raise Exception(f"Gmail API error: {response.status_code} - {response.text}")
            
            return response.json()
            
        except Exception as e:
            raise Exception(f"Failed to get message details: {str(e)}")
    
    def get_thread(self, thread_id: str) -> Dict[str, Any]:
        """Get entire email thread"""
        
        try:
            response = requests.get(
                f"{self.base_url}/threads/{thread_id}",
                headers=self.headers,
                params={"format": "full"}
            )
            
            if response.status_code != 200:
                raise Exception(f"Gmail API error: {response.status_code} - {response.text}")
            
            return response.json()
            
        except Exception as e:
            raise Exception(f"Failed to get thread: {str(e)}")
    
    def modify_labels(
        self,
        message_id: str,
        add_labels: List[str] = None,
        remove_labels: List[str] = None
    ) -> Dict[str, Any]:
        """Modify message labels (mark as read, important, etc.)"""
        
        try:
            data = {}
            if add_labels:
                data["addLabelIds"] = add_labels
            if remove_labels:
                data["removeLabelIds"] = remove_labels
            
            response = requests.post(
                f"{self.base_url}/messages/{message_id}/modify",
                headers=self.headers,
                json=data
            )
            
            if response.status_code != 200:
                raise Exception(f"Gmail API error: {response.status_code} - {response.text}")
            
            return response.json()
            
        except Exception as e:
            raise Exception(f"Failed to modify labels: {str(e)}")
    
    def search_messages(
        self,
        query: str,
        max_results: int = 50,
        page_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """Search messages with Gmail search syntax"""
        
        try:
            params = {
                "q": query,
                "maxResults": max_results
            }
            if page_token:
                params["pageToken"] = page_token
            
            response = requests.get(
                f"{self.base_url}/messages",
                headers=self.headers,
                params=params
            )
            
            if response.status_code != 200:
                raise Exception(f"Gmail API error: {response.status_code} - {response.text}")
            
            return response.json()
            
        except Exception as e:
            raise Exception(f"Failed to search messages: {str(e)}")
    
    def get_labels(self) -> List[Dict[str, Any]]:
        """Get all user labels"""
        
        try:
            response = requests.get(
                f"{self.base_url}/labels",
                headers=self.headers
            )
            
            if response.status_code != 200:
                raise Exception(f"Gmail API error: {response.status_code} - {response.text}")
            
            return response.json().get("labels", [])
            
        except Exception as e:
            raise Exception(f"Failed to get labels: {str(e)}")

class EmailProtocolHelper:
    """Helper class for email protocol compliance"""
    
    @staticmethod
    def extract_email_address(email_string: str) -> str:
        """Extract email address from formatted string"""
        match = re.search(r'<([^>]+)>', email_string)
        return match.group(1) if match else email_string.strip()
    
    @staticmethod
    def extract_display_name(email_string: str) -> str:
        """Extract display name from formatted string"""
        match = re.match(r'^([^<]+)<', email_string)
        if match:
            return match.group(1).strip().strip('"\'')
        return email_string.split('@')[0]
    
    @staticmethod
    def parse_message_headers(message: Dict[str, Any]) -> Dict[str, str]:
        """Parse Gmail message headers into a dictionary"""
        headers = {}
        
        if 'payload' in message and 'headers' in message['payload']:
            for header in message['payload']['headers']:
                name = header['name'].lower()
                value = header['value']
                headers[name] = value
        
        return headers
    
    @staticmethod
    def extract_message_body(message: Dict[str, Any]) -> Dict[str, str]:
        """Extract text and HTML body from Gmail message"""
        body_data = {"text": "", "html": ""}
        
        def extract_from_part(part):
            if part.get('mimeType') == 'text/plain':
                if 'data' in part.get('body', {}):
                    data = part['body']['data']
                    decoded = base64.urlsafe_b64decode(data).decode('utf-8')
                    body_data["text"] = decoded
            elif part.get('mimeType') == 'text/html':
                if 'data' in part.get('body', {}):
                    data = part['body']['data']
                    decoded = base64.urlsafe_b64decode(data).decode('utf-8')
                    body_data["html"] = decoded
            elif 'parts' in part:
                for subpart in part['parts']:
                    extract_from_part(subpart)
        
        if 'payload' in message:
            extract_from_part(message['payload'])
        
        return body_data
    
    @staticmethod
    def build_reply_references(original_headers: Dict[str, str]) -> Dict[str, str]:
        """Build proper In-Reply-To and References headers for replies"""
        reply_headers = {}
        
        message_id = original_headers.get('message-id')
        references = original_headers.get('references', '')
        
        if message_id:
            reply_headers['In-Reply-To'] = message_id
            
            # Build References header
            if references:
                reply_headers['References'] = f"{references} {message_id}"
            else:
                reply_headers['References'] = message_id
        
        return reply_headers
    
    @staticmethod
    def build_reply_recipients(
        original_headers: Dict[str, str],
        user_email: str,
        reply_type: str = "reply"
    ) -> Dict[str, str]:
        """Build recipient lists for reply/reply-all"""
        recipients = {}
        
        from_addr = original_headers.get('from', '')
        to_addrs = original_headers.get('to', '')
        cc_addrs = original_headers.get('cc', '')
        reply_to = original_headers.get('reply-to', from_addr)
        
        user_email_lower = user_email.lower()
        
        if reply_type == "reply":
            recipients['to'] = reply_to
            
        elif reply_type == "reply-all":
            recipients['to'] = reply_to
            
            # Collect all other recipients
            all_recipients = set()
            
            # Parse To addresses
            if to_addrs:
                for addr in to_addrs.split(','):
                    clean_addr = EmailProtocolHelper.extract_email_address(addr.strip())
                    if clean_addr.lower() != user_email_lower and clean_addr.lower() != EmailProtocolHelper.extract_email_address(reply_to).lower():
                        all_recipients.add(addr.strip())
            
            # Parse CC addresses
            if cc_addrs:
                for addr in cc_addrs.split(','):
                    clean_addr = EmailProtocolHelper.extract_email_address(addr.strip())
                    if clean_addr.lower() != user_email_lower and clean_addr.lower() != EmailProtocolHelper.extract_email_address(reply_to).lower():
                        all_recipients.add(addr.strip())
            
            if all_recipients:
                recipients['cc'] = ', '.join(all_recipients)
        
        return recipients
    
    @staticmethod
    def format_quoted_reply(
        original_body: str,
        original_headers: Dict[str, str],
        quote_prefix: str = "> "
    ) -> str:
        """Format original message as quoted text for reply"""
        
        from_addr = original_headers.get('from', 'Unknown Sender')
        date_str = original_headers.get('date', '')
        subject = original_headers.get('subject', 'No Subject')
        
        # Parse date if available
        try:
            if date_str:
                parsed_date = email.utils.parsedate_to_datetime(date_str)
                formatted_date = parsed_date.strftime('%a, %b %d, %Y at %I:%M %p')
            else:
                formatted_date = 'Unknown Date'
        except:
            formatted_date = date_str or 'Unknown Date'
        
        # Create quote header
        quote_header = f"\n\nOn {formatted_date}, {from_addr} wrote:\n"
        
        # Quote the original body
        quoted_lines = []
        for line in original_body.split('\n'):
            quoted_lines.append(f"{quote_prefix}{line}")
        
        return quote_header + '\n'.join(quoted_lines)

# Usage examples and helper functions
def create_reply_with_ai(
    original_message: Dict[str, Any],
    ai_instruction: str,
    user_email: str,
    reply_type: str = "reply"
) -> Dict[str, Any]:
    """Create a reply using AI with proper Gmail protocols"""
    
    headers = EmailProtocolHelper.parse_message_headers(original_message)
    body_data = EmailProtocolHelper.extract_message_body(original_message)
    
    # Build reply headers
    reply_headers = EmailProtocolHelper.build_reply_references(headers)
    recipients = EmailProtocolHelper.build_reply_recipients(headers, user_email, reply_type)
    
    # Format original message for context
    original_body = body_data.get('text', body_data.get('html', ''))
    quoted_reply = EmailProtocolHelper.format_quoted_reply(original_body, headers)
    
    # Build subject
    original_subject = headers.get('subject', 'No Subject')
    if reply_type == "forward":
        subject = f"Fwd: {original_subject}" if not original_subject.startswith('Fwd:') else original_subject
    else:
        subject = f"Re: {original_subject}" if not original_subject.startswith('Re:') else original_subject
    
    return {
        "to": recipients.get('to', ''),
        "cc": recipients.get('cc', ''),
        "subject": subject,
        "quoted_body": quoted_reply,
        "reply_headers": reply_headers,
        "thread_id": original_message.get('threadId'),
        "ai_context": {
            "instruction": ai_instruction,
            "original_sender": headers.get('from', ''),
            "original_subject": original_subject,
            "original_body": original_body[:500]  # Truncated for AI context
        }
    }

def validate_email_addresses(email_list: str) -> List[str]:
    """Validate and clean email address list"""
    if not email_list:
        return []
    
    emails = [email.strip() for email in email_list.split(',')]
    valid_emails = []
    
    email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    
    for email_addr in emails:
        # Extract email from "Name <email>" format
        clean_email = EmailProtocolHelper.extract_email_address(email_addr)
        if email_pattern.match(clean_email):
            valid_emails.append(email_addr)  # Keep original format with name
    
    return valid_emails

def get_conversation_context(gmail_handler: GmailAPIHandler, thread_id: str) -> List[Dict[str, Any]]:
    """Get full conversation context for better AI replies"""
    try:
        thread = gmail_handler.get_thread(thread_id)
        conversation = []
        
        for message in thread.get('messages', []):
            headers = EmailProtocolHelper.parse_message_headers(message)
            body_data = EmailProtocolHelper.extract_message_body(message)
            
            conversation.append({
                "from": headers.get('from', ''),
                "to": headers.get('to', ''),
                "subject": headers.get('subject', ''),
                "date": headers.get('date', ''),
                "body": body_data.get('text', body_data.get('html', '')),
                "message_id": message.get('id', '')
            })
        
        return conversation
        
    except Exception as e:
        print(f"Error getting conversation context: {e}")
        return []