import time
from datetime import datetime, timedelta
from typing import Dict, Tuple, Optional, List
import json

# Enhanced sentiment categories that are user-friendly
SENTIMENT_CATEGORIES = {
    "URGENT_COMPLAINT": {
        "display_name": "🚨 Urgent Issue",
        "description": "Angry customer, serious complaint, or escalated issue",
        "priority": 1,
        "color": "bg-red-100 text-red-800",
        "icon": "🚨",
        "auto_reply": True,
        "notification": True
    },
    "COMPLAINT": {
        "display_name": "⚠️ Complaint",
        "description": "Customer dissatisfaction or problem report",
        "priority": 2,
        "color": "bg-orange-100 text-orange-800",
        "icon": "⚠️",
        "auto_reply": True,
        "notification": True
    },
    "QUESTION": {
        "display_name": "❓ Question",
        "description": "Request for information or help",
        "priority": 3,
        "color": "bg-blue-100 text-blue-800",
        "icon": "❓",
        "auto_reply": False,
        "notification": False
    },
    "REQUEST": {
        "display_name": "📋 Request",
        "description": "Action item or specific request",
        "priority": 3,
        "color": "bg-purple-100 text-purple-800",
        "icon": "📋",
        "auto_reply": False,
        "notification": False
    },
    "APPRECIATION": {
        "display_name": "💝 Thank You",
        "description": "Gratitude, praise, or positive feedback",
        "priority": 4,
        "color": "bg-green-100 text-green-800",
        "icon": "💝",
        "auto_reply": False,
        "notification": False
    },
    "INFORMATIONAL": {
        "display_name": "📄 Info/Update",
        "description": "News, updates, or informational content",
        "priority": 5,
        "color": "bg-gray-100 text-gray-800",
        "icon": "📄",
        "auto_reply": False,
        "notification": False
    },
    "OPPORTUNITY": {
        "display_name": "💰 Opportunity",
        "description": "Business opportunity or potential deal",
        "priority": 2,
        "color": "bg-yellow-100 text-yellow-800",
        "icon": "💰",
        "auto_reply": False,
        "notification": True
    },
    "MEETING_INVITE": {
        "display_name": "📅 Meeting",
        "description": "Meeting invitation or scheduling",
        "priority": 3,
        "color": "bg-indigo-100 text-indigo-800",
        "icon": "📅",
        "auto_reply": False,
        "notification": False
    }
}

# Priority levels for better organization
PRIORITY_LEVELS = {
    1: {"name": "Critical", "color": "text-red-600", "urgent": True},
    2: {"name": "High", "color": "text-orange-600", "urgent": True},
    3: {"name": "Medium", "color": "text-blue-600", "urgent": False},
    4: {"name": "Low", "color": "text-green-600", "urgent": False},
    5: {"name": "Very Low", "color": "text-gray-600", "urgent": False}
}

def calculate_email_priority_score(email_data: dict, sentiment_category: str) -> Tuple[int, dict]:
    """
    Calculate comprehensive priority score based on multiple factors
    Returns: (priority_score, priority_details)
    """
    base_priority = SENTIMENT_CATEGORIES.get(sentiment_category, {}).get("priority", 5)
    priority_factors = {
        "sentiment_priority": base_priority,
        "time_factor": 0,
        "sender_importance": 0,
        "keyword_urgency": 0,
        "response_expectation": 0
    }
    
    # Time-based urgency (recent emails get slight priority boost)
    if email_data.get('internalDate'):
        email_time = datetime.fromtimestamp(int(email_data['internalDate']) / 1000)
        time_diff = datetime.now() - email_time
        
        if time_diff < timedelta(hours=2):
            priority_factors["time_factor"] = -0.5  # Boost priority
        elif time_diff < timedelta(hours=24):
            priority_factors["time_factor"] = -0.2
    
    # Sender importance (basic domain analysis)
    sender = email_data.get('from', '').lower()
    if any(domain in sender for domain in ['@gmail.com', '@company.com', '@important-client.com']):
        priority_factors["sender_importance"] = -0.3
    
    # Keyword-based urgency detection
    content = f"{email_data.get('subject', '')} {email_data.get('snippet', '')}".lower()
    urgent_keywords = ['urgent', 'asap', 'emergency', 'critical', 'immediate', 'deadline']
    
    urgent_count = sum(1 for keyword in urgent_keywords if keyword in content)
    if urgent_count > 0:
        priority_factors["keyword_urgency"] = min(-1.0, -0.3 * urgent_count)
    
    # Response expectation keywords
    response_keywords = ['please reply', 'need response', 'waiting for', 'follow up']
    if any(keyword in content for keyword in response_keywords):
        priority_factors["response_expectation"] = -0.5
    
    # Calculate final priority
    final_priority = base_priority + sum(priority_factors.values())
    final_priority = max(1, min(5, round(final_priority)))
    
    return int(final_priority), priority_factors

def analyze_email_sentiment_enhanced(email_data: dict, groq_client) -> dict:
    """
    Enhanced sentiment analysis with user-friendly categories and prioritization
    """
    # Default values
    default_result = {
        "sentiment_category": "INFORMATIONAL",
        "sentiment_display": SENTIMENT_CATEGORIES["INFORMATIONAL"]["display_name"],
        "priority_level": 5,
        "priority_name": "Very Low",
        "confidence": 0,
        "analysis_details": {},
        "suggested_reply_body": None,
        "reply_status": "Not Replied",
        "requires_immediate_attention": False,
        "auto_reply_suggested": False
    }
    
    if not groq_client:
        print("⚠️ Groq client not available, using default categorization")
        return default_result
    
    try:
        print(f"🤖 Enhanced AI analysis for email: {email_data.get('id', 'Unknown')}")
        
        # Enhanced prompt for better categorization
        analysis_prompt = f"""
        Analyze this email and categorize it. Respond with ONLY a JSON object in this exact format:
        {{"category": "CATEGORY_NAME", "confidence": 85, "reasoning": "brief explanation"}}
        
        Available categories:
        - URGENT_COMPLAINT: Angry customer, serious issue, escalated problem
        - COMPLAINT: Customer dissatisfaction, problem report, negative feedback
        - QUESTION: Request for information, asking for help, inquiry
        - REQUEST: Action item, task request, asking for something specific
        - APPRECIATION: Thank you, praise, positive feedback, gratitude
        - INFORMATIONAL: Updates, news, announcements, FYI content
        - OPPORTUNITY: Business opportunity, potential deal, sales lead
        - MEETING_INVITE: Meeting invitation, calendar invite, scheduling
        
        Email details:
        From: {email_data.get('from', '')}
        Subject: {email_data.get('subject', '')}
        Content: {email_data.get('snippet', '')[:500]}
        
        Consider urgency indicators like: urgent, ASAP, deadline, emergency, critical, angry tone, complaint words.
        """
        
        completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system", 
                    "content": "You are an expert email analyst. Categorize emails accurately based on content and tone. Always respond with valid JSON only."
                },
                {
                    "role": "user", 
                    "content": analysis_prompt
                }
            ],
            model="llama3-8b-8192",
            temperature=0.2,
            max_tokens=150
        )
        
        # Parse AI response
        ai_response = completion.choices[0].message.content.strip()
        print(f"📋 Raw AI response: {ai_response}")
        
        # Clean and parse JSON response
        if ai_response.startswith('```json'):
            ai_response = ai_response.replace('```json', '').replace('```', '').strip()
        
        try:
            parsed_response = json.loads(ai_response)
            category = parsed_response.get("category", "INFORMATIONAL")
            confidence = parsed_response.get("confidence", 50)
            reasoning = parsed_response.get("reasoning", "AI analysis")
        except json.JSONDecodeError:
            print(f"⚠️ Failed to parse AI JSON response: {ai_response}")
            # Fallback to keyword-based analysis
            content_lower = f"{email_data.get('subject', '')} {email_data.get('snippet', '')}".lower()
            category = fallback_keyword_analysis(content_lower)
            confidence = 30
            reasoning = "Fallback keyword analysis"
        
        # Validate category exists
        if category not in SENTIMENT_CATEGORIES:
            print(f"⚠️ Unknown category '{category}', defaulting to INFORMATIONAL")
            category = "INFORMATIONAL"
        
        # Calculate priority
        priority_level, priority_factors = calculate_email_priority_score(email_data, category)
        
        # Get category details
        category_info = SENTIMENT_CATEGORIES[category]
        priority_info = PRIORITY_LEVELS[priority_level]
        
        # Build result
        result = {
            "sentiment_category": category,
            "sentiment_display": category_info["display_name"],
            "priority_level": priority_level,
            "priority_name": priority_info["name"],
            "confidence": confidence,
            "analysis_details": {
                "reasoning": reasoning,
                "priority_factors": priority_factors,
                "auto_reply_enabled": category_info["auto_reply"],
                "notification_enabled": category_info["notification"]
            },
            "requires_immediate_attention": priority_level <= 2,
            "auto_reply_suggested": category_info["auto_reply"] and priority_level <= 2
        }
        
        # Generate reply for complaints and urgent issues
        if category in ["URGENT_COMPLAINT", "COMPLAINT"] and priority_level <= 2:
            try:
                reply_prompt = get_reply_prompt_for_category(category, email_data)
                reply_completion = groq_client.chat.completions.create(
                    messages=[
                        {
                            "role": "system",
                            "content": reply_prompt["system"]
                        },
                        {
                            "role": "user",
                            "content": reply_prompt["user"]
                        }
                    ],
                    model="llama3-8b-8192",
                    temperature=0.7,
                    max_tokens=300
                )
                
                result["suggested_reply_body"] = reply_completion.choices[0].message.content.strip()
                result["reply_status"] = "AI Reply Suggested"
                print(f"✅ Generated reply suggestion for {category}")
                
            except Exception as e:
                print(f"⚠️ Reply generation failed: {e}")
                result["reply_status"] = "Reply Needed"
        else:
            result["reply_status"] = "Not Replied"
        
        print(f"✅ Enhanced analysis complete: {category} (Priority: {priority_level})")
        return result
        
    except Exception as e:
        print(f"⚠️ Enhanced AI analysis failed: {e}")
        return default_result

def fallback_keyword_analysis(content: str) -> str:
    """Fallback keyword-based categorization when AI fails"""
    
    # Define keyword patterns for each category
    keyword_patterns = {
        "URGENT_COMPLAINT": ["angry", "furious", "unacceptable", "terrible", "worst", "hate", "disgusted", "urgent complaint"],
        "COMPLAINT": ["disappointed", "unsatisfied", "problem", "issue", "wrong", "error", "complaint", "not working"],
        "QUESTION": ["?", "how to", "can you", "could you", "what is", "why", "when", "where", "help me"],
        "REQUEST": ["please", "can you please", "need you to", "request", "asking for", "require"],
        "APPRECIATION": ["thank you", "thanks", "grateful", "appreciate", "excellent", "great job", "well done"],
        "OPPORTUNITY": ["opportunity", "deal", "proposal", "partnership", "collaboration", "business"],
        "MEETING_INVITE": ["meeting", "calendar", "schedule", "invite", "appointment", "call"]
    }
    
    # Score each category
    category_scores = {}
    for category, keywords in keyword_patterns.items():
        score = sum(1 for keyword in keywords if keyword in content)
        if score > 0:
            category_scores[category] = score
    
    # Return highest scoring category or default
    if category_scores:
        return max(category_scores, key=category_scores.get)
    
    return "INFORMATIONAL"

def get_reply_prompt_for_category(category: str, email_data: dict) -> dict:
    """Get appropriate reply prompts based on email category"""
    
    prompts = {
        "URGENT_COMPLAINT": {
            "system": "You are a senior customer service manager responding to an urgent complaint. Be empathetic, professional, take immediate responsibility, and outline clear next steps. Show urgency in your response.",
            "user": f"Draft an urgent response to this complaint:\n\nFrom: {email_data.get('from', '')}\nSubject: {email_data.get('subject', '')}\nContent: {email_data.get('snippet', '')}"
        },
        "COMPLAINT": {
            "system": "You are a customer service representative responding to a complaint. Be understanding, professional, and solution-focused. Acknowledge the issue and provide next steps.",
            "user": f"Draft a professional response to this complaint:\n\nFrom: {email_data.get('from', '')}\nSubject: {email_data.get('subject', '')}\nContent: {email_data.get('snippet', '')}"
        }
    }
    
    return prompts.get(category, prompts["COMPLAINT"])

def process_email_with_enhanced_ai(email_data: dict, groq_client) -> dict:
    """
    Main function to replace the existing process_email_with_ai function
    """
    # Set basic defaults
    email_data.setdefault('sentiment', 'INFORMATIONAL')
    email_data.setdefault('reply_status', 'Not Replied')
    
    # Perform enhanced analysis
    analysis_result = analyze_email_sentiment_enhanced(email_data, groq_client)
    
    # Update email data with enhanced analysis
    email_data.update({
        'sentiment': analysis_result['sentiment_category'],
        'sentiment_display': analysis_result['sentiment_display'],
        'priority_level': analysis_result['priority_level'],
        'priority_name': analysis_result['priority_name'],
        'confidence': analysis_result['confidence'],
        'reply_status': analysis_result['reply_status'],
        'suggested_reply_body': analysis_result.get('suggested_reply_body'),
        'requires_immediate_attention': analysis_result['requires_immediate_attention'],
        'analysis_details': json.dumps(analysis_result['analysis_details'])
    })
    
    return email_data

# Usage example and testing function
def test_enhanced_sentiment_analysis():
    """Test function to verify the enhanced sentiment system"""
    
    test_emails = [
        {
            "id": "test1",
            "from": "angry.customer@example.com",
            "subject": "URGENT: Your service is terrible!",
            "snippet": "I am absolutely furious with your service. This is unacceptable and I demand immediate action!",
            "internalDate": str(int(time.time() * 1000))
        },
        {
            "id": "test2", 
            "from": "client@business.com",
            "subject": "Question about your pricing",
            "snippet": "Hi, I was wondering if you could help me understand your pricing structure? I have a few questions.",
            "internalDate": str(int(time.time() * 1000))
        },
        {
            "id": "test3",
            "from": "partner@company.com", 
            "subject": "Thank you for the excellent service",
            "snippet": "I wanted to thank you for the outstanding support. Your team was incredible and exceeded our expectations.",
            "internalDate": str(int(time.time() * 1000))
        }
    ]
    
    print("🧪 Testing Enhanced Sentiment Analysis System")
    print("=" * 50)
    
    for email in test_emails:
        print(f"\n📧 Testing email: {email['subject']}")
        
        # Test fallback analysis
        content = f"{email['subject']} {email['snippet']}".lower()
        fallback_category = fallback_keyword_analysis(content)
        priority_level, priority_factors = calculate_email_priority_score(email, fallback_category)
        
        print(f"📋 Fallback Category: {fallback_category}")
        print(f"⚡ Priority Level: {priority_level} ({PRIORITY_LEVELS[priority_level]['name']})")
        print(f"📊 Priority Factors: {priority_factors}")
        
        category_info = SENTIMENT_CATEGORIES.get(fallback_category, {})
        print(f"🎨 Display: {category_info.get('display_name', 'Unknown')}")
        print(f"🔔 Auto-reply: {category_info.get('auto_reply', False)}")

if __name__ == "__main__":
    test_enhanced_sentiment_analysis() 