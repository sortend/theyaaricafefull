export const metadata = { title: "Contact — The Yaari Café" };
export default function Page() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL, phone = process.env.NEXT_PUBLIC_CONTACT_PHONE, address = process.env.NEXT_PUBLIC_CAFE_ADDRESS;
  return <main className="section" style={{ paddingTop: 140, maxWidth: 760 }}><h2>Contact and location</h2>
    {address && <p>{address}</p>}{phone && <p><a href={`tel:${phone}`}>{phone}</a></p>}{email && <p><a href={`mailto:${email}`}>{email}</a></p>}
    {!address && !phone && !email && <p>Contact details are not configured yet. Set NEXT_PUBLIC_CAFE_ADDRESS, NEXT_PUBLIC_CONTACT_PHONE and NEXT_PUBLIC_CONTACT_EMAIL.</p>}</main>;
}
