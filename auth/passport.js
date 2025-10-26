import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { query } from "../db.js";
import dotenv from "dotenv";
dotenv.config();

passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
  try {
    const res = await query("SELECT * FROM users WHERE id = $1", [id]);
    done(null, res.rows[0] || null);
  } catch (err) {
    done(err, null);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const googleId = profile.id;
        // Find user by google_id or email
        let res = await query("SELECT * FROM users WHERE google_id = $1 OR email = $2", [googleId, email]);
        if (res.rows.length) {
          const user = res.rows[0];
          // If google_id not set, set it
          if (!user.google_id) {
            await query("UPDATE users SET google_id = $1 WHERE id = $2", [googleId, user.id]);
            user.google_id = googleId;
          }
          return done(null, user);
        }
        // Create user
        const insert = await query(
          "INSERT INTO users (username, email, google_id, role_id) VALUES ($1, $2, $3, $4) RETURNING *",
          [profile.displayName || profile.username || email.split("@")[0], email, googleId, 3]
        );
        return done(null, insert.rows[0]);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

export default passport;