const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function buffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    
    console.log('Payment succeeded:', paymentIntent.id);

    const metadata = paymentIntent.metadata;
    
    const ghlPayload = {
      firstName: metadata.businessName || 'Business Owner',
      phone: metadata.phone,
      email: metadata.email || '',
      
      jobTitle: metadata.jobTitle,
      payPerHour: metadata.payPerHour || '',
      postcode: metadata.postcode,
      
      budget: metadata.budget,
      dailyBudget: Math.floor((metadata.budget * 100) / 9),
      campaignStatus: 'pending',
      
      stripePaymentId: paymentIntent.id,
      paymentAmount: (paymentIntent.amount / 100).toString(),
      
      source: 'localhire_landing_page',
      submittedAt: new Date().toISOString(),
    };

    try {
      const response = await fetch(process.env.GHL_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ghlPayload)
      });

      if (!response.ok) {
        console.error('GHL webhook failed:', await response.text());
      } else {
        console.log('Successfully sent to GHL');
      }

    } catch (error) {
      console.error('Error sending to GHL:', error);
    }
  }

  res.status(200).json({ received: true });
};

export const config = {
  api: {
    bodyParser: false,
  },
};
