CREATE TABLE "attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"client_id" text NOT NULL,
	"word_sense_id" integer NOT NULL,
	"exercise_id" integer,
	"exercise_type" text NOT NULL,
	"is_correct" boolean,
	"hint_used" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempts_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "word_sense_progress" (
	"word_sense_id" integer PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"incorrect_count" integer DEFAULT 0 NOT NULL,
	"last_trained_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_word_sense_id_word_senses_id_fk" FOREIGN KEY ("word_sense_id") REFERENCES "public"."word_senses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_sense_progress" ADD CONSTRAINT "word_sense_progress_word_sense_id_word_senses_id_fk" FOREIGN KEY ("word_sense_id") REFERENCES "public"."word_senses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_sense_progress" ADD CONSTRAINT "word_sense_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_user_idx" ON "attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attempts_sense_idx" ON "attempts" USING btree ("word_sense_id");--> statement-breakpoint
CREATE INDEX "word_sense_progress_user_idx" ON "word_sense_progress" USING btree ("user_id");