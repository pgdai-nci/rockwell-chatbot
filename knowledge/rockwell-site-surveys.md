# Rockwell Site Surveys & Engineering Services: Catalogue Knowledge Base

> This file is the single source of truth for the Rockwell chatbot. Every figure,
> region rule, and slot rule below is loaded into the chatbot's system prompt.
> The catalogue is illustrative of a real engineering-services business case and is
> used for demonstration. Prices are indicative and may be confirmed on request.

---

## What Rockwell Site Surveys & Engineering does

Rockwell Site Surveys & Engineering delivers on-site and remote site-survey and
engineering services for industrial plants: manufacturing, energy, water and
wastewater, food and beverage, and life sciences. A customer books a slot for a
survey or an engineering study, Rockwell sends an engineer (on-site or remote),
and the customer receives a findings report and an engineering recommendation.

---

## Service catalogue

### A. Site Survey Services

| Code | Service | Duration | What the customer gets |
|------|---------|----------|------------------------|
| SUR-D | Desk Survey (remote) | 1 day | Remote review of drawings, schematics, and asset register; findings memo |
| SUR-S | Standard Site Survey | 1 day on site + 1 day reporting | On-site inspection, equipment walkdown, interviews, findings report |
| SUR-C | Comprehensive Site Survey | 2 days on site + reporting | Full plant walkdown, data capture, risk list, detailed engineering report |
| SUR-E | Emergency Site Survey | mobilised within 72 hours | Priority response for outages or incidents; preliminary report in 48 h after visit |

### B. Engineering Services

| Code | Service | Typical duration | What the customer gets |
|------|---------|------------------|------------------------|
| ENG-F | Feasibility & Concept Study | 2 weeks | Options, cost model, concept recommendation |
| ENG-A | Control System Audit | 4 days | Audit of PLC/DCS/SCADA estate, risk register, upgrade roadmap |
| ENG-N | Industrial Network & Cybersecurity Assessment | 5 days | Network topology review, security posture, remediation plan |
| ENG-E | Energy & Process Efficiency Assessment | 4 days | Energy baseline, efficiency opportunities, ROI estimates |
| ENG-D | Design Engineering Package | 4 to 6 weeks | Detailed design, I/O and cable schedule, deliverables pack |
| ENG-M | Modernisation Masterplan | 6 weeks | Multi-year modernisation roadmap, phased investment plan |

---

## Regions

| Region | Name | Notes |
|--------|------|-------|
| REG-A | Metro & Local | Within 100 km of a Rockwell office; standard fees, fastest slot lead times |
| REG-B | National | Anywhere in-country; standard fees plus travel allowance |
| REG-C | International & Remote | Cross-border or hard-to-reach sites; higher fees, travel and logistics added, fewer slots per month |

Travel allowance (REG-B): EUR 600 per survey plus mileage at EUR 0.40 per km.
International (REG-C): travel and logistics quoted per project; typically adds 15% to 25% to the base fee.

---

## Slots and booking rules

- **Monthly slot capacity per region:**
  - SUR-D Desk Survey: 4 slots per month (REG-A 2, REG-B 1, REG-C 1)
  - SUR-S Standard Site Survey: 6 slots per month (REG-A 3, REG-B 2, REG-C 1)
  - SUR-C Comprehensive Site Survey: 3 slots per month (REG-A 2, REG-B 1)
  - SUR-E Emergency Site Survey: 1 slot per month, REG-A and REG-B only
  - Engineering services (ENG-*): 2 start slots per month per service, any region
- **Booking lead time:** SUR-S and SUR-C require at least 2 weeks notice. SUR-D requires 5 business days. SUR-E can be mobilised within 72 hours. ENG services start at the next monthly release.
- **Slot release:** new monthly slots are released on the first business day of each month on a first-come, first-served basis.
- **Confirmed slot deposit:** 30% of the fee to secure a slot; balance due before the visit.
- **Rescheduling:** free once, up to 7 days before the visit; second reschedule incurs 15% of the fee.
- **Cancellation:** more than 14 days before the visit, 15% fee; 7 to 14 days, 50%; within 7 days, 100%.

---

## Fees (indicative price list)

| Code | Service | Base fee (EUR) |
|------|---------|----------------|
| SUR-D | Desk Survey | 1,900 |
| SUR-S | Standard Site Survey | 3,800 |
| SUR-C | Comprehensive Site Survey | 6,400 |
| SUR-E | Emergency Site Survey | base fee + 50% surcharge |
| ENG-F | Feasibility & Concept Study | 12,000 |
| ENG-A | Control System Audit | 8,500 |
| ENG-N | Network & Cybersecurity Assessment | 11,000 |
| ENG-E | Energy & Process Efficiency Assessment | 9,500 |
| ENG-D | Design Engineering Package | from 28,000 |
| ENG-M | Modernisation Masterplan | from 45,000 |

Group and multi-site discounts: 10% off for 3 or more surveys booked together,
15% off for 5 or more. A recurring-account programme gives 10% off all services
for annual contracts.

---

## Chatbot rules

1. Recommend the smallest service that genuinely solves the customer's problem. Do not upsell.
2. Quote fees as indicative and always add: "Indicative price; final quotation confirmed on request."
3. Check slot availability before recommending a booking window. Ask for region and preferred month.
4. If a region or service is unavailable, say so plainly and offer the closest alternative.
5. Never invent customers, bookings, or availability. The chatbot cannot hold a booking itself; it hands over to the Rockwell scheduling team.
6. Answer in the customer's language. Default to English.
7. Escalate incidents or safety-critical questions to the Emergency line: the Emergency Site Survey service.
