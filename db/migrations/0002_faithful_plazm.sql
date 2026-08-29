CREATE TABLE "translation_cache" (
	"query" text PRIMARY KEY NOT NULL,
	"response_json" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_folders" (
	"word_id" integer NOT NULL,
	"folder_id" integer NOT NULL,
	CONSTRAINT "word_folders_word_id_folder_id_pk" PRIMARY KEY("word_id","folder_id")
);
--> statement-breakpoint
CREATE TABLE "word_senses" (
	"id" serial PRIMARY KEY NOT NULL,
	"word_id" integer NOT NULL,
	"translation" text NOT NULL,
	"part_of_speech" text,
	"definition_en" text,
	"example" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "words" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"text" text NOT NULL,
	"text_norm" text NOT NULL,
	"transcription" text,
	"is_phrase" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "word_folders" ADD CONSTRAINT "word_folders_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_folders" ADD CONSTRAINT "word_folders_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_senses" ADD CONSTRAINT "word_senses_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "word_folders_folder_idx" ON "word_folders" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "word_senses_word_idx" ON "word_senses" USING btree ("word_id");--> statement-breakpoint
CREATE UNIQUE INDEX "words_user_norm_uidx" ON "words" USING btree ("user_id","text_norm") WHERE "words"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "folders_user_idx" ON "folders" USING btree ("user_id");