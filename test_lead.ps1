$body = @{
    name = "Donny"
    email = "bavikaran4@gmail.com"
    phone = "+94775647989"
    propertyId = "1"
    interestedUnit = ""
    password = "password123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/leads" -Method Post -Body $body -ContentType "application/json"
