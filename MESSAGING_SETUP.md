# Messaging Setup Guide

This guide will help you configure email and SMS messaging functionality for the Villahermosa Dental Clinic application.

## Email Configuration (SMTP)

### Option 1: Gmail (Recommended for Testing)

1. **Enable 2-Factor Authentication** on your Google Account:
   - Go to https://myaccount.google.com/security
   - Enable 2-Step Verification

2. **Create an App Password**:
   - Visit https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Name it "Villahermosa Dental Clinic"
   - Copy the 16-character password

3. **Update your `.env` file**:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=xxxx xxxx xxxx xxxx  # Your 16-character app password
   SMTP_FROM=your-email@gmail.com
   ```

### Option 2: Other Email Providers

#### Outlook/Office 365
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
SMTP_FROM=your-email@outlook.com
```

#### SendGrid (Production Recommended)
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=noreply@yourdomain.com
```

## SMS Configuration (Twilio)

### Step 1: Create a Twilio Account

1. Go to https://www.twilio.com/try-twilio
2. Sign up for a free account
3. Verify your email and phone number

### Step 2: Get Your Credentials

1. Log in to the Twilio Console: https://console.twilio.com
2. Find your **Account SID** and **Auth Token** on the dashboard
3. Get a phone number:
   - Go to **Phone Numbers** > **Manage** > **Buy a number**
   - For free trial: You can use your trial number
   - For production: Purchase a number ($1-2/month)

### Step 3: Configure Twilio in `.env`

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

### Important Notes for Twilio Trial Account

- **Trial accounts can only send SMS to verified phone numbers**
- To add verified numbers:
  1. Go to **Phone Numbers** > **Manage** > **Verified Caller IDs**
  2. Click **Add a new Caller ID**
  3. Enter the phone number and verify it

- Trial messages include a prefix: "Sent from your Twilio trial account"
- To remove this, upgrade to a paid account (no monthly fee, pay-per-use)

## Testing the Configuration

### Test Email

You can test email sending using this curl command:

```bash
curl -X POST http://localhost:3001/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "patientEmail": "test@example.com",
    "patientPhone": "+1234567890",
    "patientName": "Test Patient",
    "message": "This is a test message from Villahermosa Dental Clinic"
  }'
```

### Test SMS

Make sure the phone number is verified in your Twilio account if using a trial account.

## Troubleshooting

### Email Issues

**Error: "Invalid login"**
- Double-check your SMTP credentials
- If using Gmail, make sure you're using an App Password, not your regular password
- Verify 2FA is enabled on your Google account

**Error: "Connection timeout"**
- Check your firewall settings
- Try port 465 with `SMTP_SECURE=true` for SSL
- Some networks block port 587

### SMS Issues

**Error: "Unable to create record"**
- Verify your Twilio credentials are correct
- Check that your account SID and Auth Token are valid
- Make sure your Twilio phone number is in E.164 format (+1234567890)

**Error: "To number is not a valid mobile number"**
- Phone numbers must be in E.164 format: +[country code][number]
- For trial accounts, the recipient number must be verified

**Trial account limitation**
- You can only send to verified numbers
- Messages will include "Sent from your Twilio trial account"
- Upgrade to remove these limitations

## Production Recommendations

### Email
- Use a dedicated email service like **SendGrid** or **Amazon SES**
- Set up SPF, DKIM, and DMARC records for your domain
- Monitor bounce rates and spam complaints

### SMS
- Upgrade Twilio to a paid account (pay-per-message, ~$0.0075/SMS)
- Register your business with Twilio for better deliverability
- Consider getting a toll-free number for better trust

## Cost Estimates

### Email
- Gmail: Free (for low volume)
- SendGrid: Free tier (100 emails/day), then $19.95/month (40,000 emails)
- Amazon SES: $0.10 per 1,000 emails

### SMS (Twilio)
- SMS to US/Canada: ~$0.0079 per message
- Phone number rental: ~$1.15/month
- Free trial: $15.50 in credits

## Security Best Practices

1. **Never commit `.env` file to version control**
2. Use environment variables in production
3. Rotate credentials regularly
4. Monitor usage for unusual activity
5. Implement rate limiting on the message endpoint
6. Validate phone numbers before sending SMS
7. Use email verification to prevent spam

## Additional Resources

- [Nodemailer Documentation](https://nodemailer.com/)
- [Twilio SMS Quickstart](https://www.twilio.com/docs/sms/quickstart/node)
- [Gmail App Passwords Guide](https://support.google.com/accounts/answer/185833)
