#define _GNU_SOURCE

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

#include <tensorflow/c/c_api.h>

#include "scaler_params.h"

/*
 * TensorFlow C API CSV inference example.
 *
 * Flow:
 *   test/0529_vUE/test_data.csv
 *     -> read one CSV row
 *     -> x_scaling using scaler_params.h
 *     -> TensorFlow SavedModel inference
 *     -> y inverse scaling using scaler_params.h
 *     -> test/0529_vUE/inference_result.csv
 *
 * Required local files/directories:
 *   model/saved_model/
 *   src/scaler_params.h
 *   third_party/tensorflow/include/
 *   third_party/tensorflow/lib/
 */

#define MODEL_DIR       "model/saved_model"
#define INPUT_CSV_PATH  "test/0529_vUE/test_data.csv"
#define OUTPUT_CSV_PATH "test/0529_vUE/inference_result.csv"

/*
 * Check these names with:
 *   saved_model_cli show --dir model/saved_model --all
 *
 * Example output:
 *   input  name: serving_default_input:0
 *   output name: StatefulPartitionedCall:0
 */
#define INPUT_OP_NAME   "serving_default_input"
#define INPUT_OP_INDEX  0

#define OUTPUT_OP_NAME  "StatefulPartitionedCall"
#define OUTPUT_OP_INDEX 0

/*
 * If the CSV has non-feature columns before the input features, adjust this.
 *
 * Examples:
 *   f1,f2,f3,...                -> 0
 *   time,f1,f2,f3,...           -> 1
 *   index,time,f1,f2,f3,...     -> 2
 */
#define FEATURE_START_COL 0

#define MAX_CSV_COLUMNS 4096


static void free_tensor_buffer(void* data, size_t len, void* arg) {
    (void)len;
    (void)arg;
    free(data);
}


static void check_status(TF_Status* status, const char* msg) {
    if (TF_GetCode(status) != TF_OK) {
        fprintf(stderr, "%s failed: %s\n", msg, TF_Message(status));
        exit(1);
    }
}


/*
 * Simple CSV parser for numeric comma-separated values.
 *
 * Notes:
 *   - Header rows are skipped because parsing returns -1.
 *   - Quoted CSV fields are not supported.
 */
static int parse_csv_line(const char* line, float* values, int max_values) {
    int count = 0;
    const char* p = line;

    while (*p != '\0' && count < max_values) {
        while (*p == ' ' || *p == '\t' || *p == ',') {
            p++;
        }

        if (*p == '\0' || *p == '\n' || *p == '\r') {
            break;
        }

        errno = 0;
        char* endptr = NULL;
        float v = strtof(p, &endptr);

        if (p == endptr) {
            return -1;
        }

        if (errno == ERANGE) {
            fprintf(stderr, "Warning: float range error near: %s\n", p);
        }

        values[count++] = v;
        p = endptr;

        while (*p == ' ' || *p == '\t') {
            p++;
        }

        if (*p == ',') {
            p++;
        } else if (*p == '\0' || *p == '\n' || *p == '\r') {
            break;
        } else {
            while (*p != '\0' && *p != ',' && *p != '\n' && *p != '\r') {
                p++;
            }
            if (*p == ',') {
                p++;
            }
        }
    }

    return count;
}


/*
 * x_scaling:
 *   x_scaled = x_raw * X_SCALER_MUL + X_SCALER_ADD
 *
 * For RobustScaler, scaler_params.h should contain:
 *   X_SCALER_MUL = 1 / scale_
 *   X_SCALER_ADD = -center_ / scale_
 */
static TF_Tensor* make_input_tensor(const float* raw_input) {
    float* scaled = (float*)malloc(sizeof(float) * N_FEATURES);
    if (!scaled) {
        fprintf(stderr, "malloc failed for input tensor\n");
        exit(1);
    }

    for (int i = 0; i < N_FEATURES; i++) {
        scaled[i] = raw_input[i] * X_SCALER_MUL[i] + X_SCALER_ADD[i];
    }

    int64_t dims[2] = {1, N_FEATURES};

    TF_Tensor* tensor = TF_NewTensor(
        TF_FLOAT,
        dims,
        2,
        scaled,
        sizeof(float) * N_FEATURES,
        free_tensor_buffer,
        NULL
    );

    if (!tensor) {
        fprintf(stderr, "TF_NewTensor failed\n");
        free(scaled);
        exit(1);
    }

    return tensor;
}


/*
 * Run one inference.
 *
 * y inverse scaling:
 *   y_original = (y_scaled - Y_SCALER_ADD) / Y_SCALER_MUL
 *
 * For RobustScaler, this is equivalent to:
 *   y_original = y_scaled * scale_ + center_
 */
static int run_inference_one_row(
    TF_Session* session,
    TF_Status* status,
    TF_Output input,
    TF_Output output,
    const float* raw_input,
    float* y_original_out
) {
    TF_Tensor* input_tensor = make_input_tensor(raw_input);
    TF_Tensor* output_tensor = NULL;

    TF_SessionRun(
        session,
        NULL,
        &input,
        &input_tensor,
        1,
        &output,
        &output_tensor,
        1,
        NULL,
        0,
        NULL,
        status
    );

    check_status(status, "TF_SessionRun");

    if (!output_tensor) {
        fprintf(stderr, "Output tensor is NULL\n");
        TF_DeleteTensor(input_tensor);
        return -1;
    }

    float* y_scaled = (float*)TF_TensorData(output_tensor);
    size_t output_size = TF_TensorByteSize(output_tensor) / sizeof(float);
    size_t n = output_size < N_OUTPUTS ? output_size : N_OUTPUTS;

    for (size_t i = 0; i < n; i++) {
        if (Y_SCALER_MUL[i] == 0.0f) {
            y_original_out[i] = y_scaled[i];
        } else {
            y_original_out[i] = (y_scaled[i] - Y_SCALER_ADD[i]) / Y_SCALER_MUL[i];
        }
    }

    TF_DeleteTensor(input_tensor);
    TF_DeleteTensor(output_tensor);

    return (int)n;
}


int main(void) {
    printf("TensorFlow C API version: %s\n", TF_Version());
    printf("MODEL_DIR       : %s\n", MODEL_DIR);
    printf("INPUT_CSV_PATH  : %s\n", INPUT_CSV_PATH);
    printf("OUTPUT_CSV_PATH : %s\n", OUTPUT_CSV_PATH);
    printf("N_FEATURES      : %d\n", N_FEATURES);
    printf("N_OUTPUTS       : %d\n", N_OUTPUTS);

    TF_Status* status = TF_NewStatus();
    TF_Graph* graph = TF_NewGraph();
    TF_SessionOptions* session_opts = TF_NewSessionOptions();

    const char* tags[] = {"serve"};

    TF_Session* session = TF_LoadSessionFromSavedModel(
        session_opts,
        NULL,
        MODEL_DIR,
        tags,
        1,
        graph,
        NULL,
        status
    );

    check_status(status, "TF_LoadSessionFromSavedModel");

    TF_Operation* input_op = TF_GraphOperationByName(graph, INPUT_OP_NAME);
    if (input_op == NULL) {
        fprintf(stderr, "Input op not found: %s\n", INPUT_OP_NAME);
        fprintf(stderr, "Check with:\n");
        fprintf(stderr, "  saved_model_cli show --dir %s --all\n", MODEL_DIR);
        exit(1);
    }

    TF_Operation* output_op = TF_GraphOperationByName(graph, OUTPUT_OP_NAME);
    if (output_op == NULL) {
        fprintf(stderr, "Output op not found: %s\n", OUTPUT_OP_NAME);
        fprintf(stderr, "Check with:\n");
        fprintf(stderr, "  saved_model_cli show --dir %s --all\n", MODEL_DIR);
        exit(1);
    }

    TF_Output input = {
        .oper = input_op,
        .index = INPUT_OP_INDEX
    };

    TF_Output output = {
        .oper = output_op,
        .index = OUTPUT_OP_INDEX
    };

    FILE* fin = fopen(INPUT_CSV_PATH, "r");
    if (!fin) {
        perror("fopen input csv failed");
        exit(1);
    }

    FILE* fout = fopen(OUTPUT_CSV_PATH, "w");
    if (!fout) {
        perror("fopen output csv failed");
        fclose(fin);
        exit(1);
    }

    fprintf(fout, "row");
    for (int i = 0; i < N_OUTPUTS; i++) {
        fprintf(fout, ",y%d", i);
    }
    fprintf(fout, "\n");

    char* line = NULL;
    size_t line_cap = 0;

    float csv_values[MAX_CSV_COLUMNS];
    float raw_input[N_FEATURES];
    float y_original[N_OUTPUTS];

    long csv_line_no = 0;
    long valid_row_no = 0;
    int skipped_rows = 0;

    while (getline(&line, &line_cap, fin) != -1) {
        csv_line_no++;

        int n_cols = parse_csv_line(line, csv_values, MAX_CSV_COLUMNS);

        if (n_cols < 0) {
            skipped_rows++;
            continue;
        }

        if (n_cols < FEATURE_START_COL + N_FEATURES) {
            fprintf(
                stderr,
                "Warning: line %ld skipped. columns=%d, required=%d\n",
                csv_line_no,
                n_cols,
                FEATURE_START_COL + N_FEATURES
            );
            skipped_rows++;
            continue;
        }

        for (int i = 0; i < N_FEATURES; i++) {
            raw_input[i] = csv_values[FEATURE_START_COL + i];
        }

        for (int i = 0; i < N_OUTPUTS; i++) {
            y_original[i] = 0.0f;
        }

        int n_out = run_inference_one_row(
            session,
            status,
            input,
            output,
            raw_input,
            y_original
        );

        if (n_out <= 0) {
            fprintf(stderr, "Warning: inference failed at line %ld\n", csv_line_no);
            skipped_rows++;
            continue;
        }

        fprintf(fout, "%ld", valid_row_no);
        for (int i = 0; i < N_OUTPUTS; i++) {
            if (i < n_out) {
                fprintf(fout, ",%.9f", y_original[i]);
            } else {
                fprintf(fout, ",");
            }
        }
        fprintf(fout, "\n");

        valid_row_no++;
    }

    free(line);
    fclose(fin);
    fclose(fout);

    printf("Done.\n");
    printf("Valid rows  : %ld\n", valid_row_no);
    printf("Skipped rows: %d\n", skipped_rows);
    printf("Result saved: %s\n", OUTPUT_CSV_PATH);

    TF_CloseSession(session, status);
    check_status(status, "TF_CloseSession");

    TF_DeleteSession(session, status);
    check_status(status, "TF_DeleteSession");

    TF_DeleteSessionOptions(session_opts);
    TF_DeleteGraph(graph);
    TF_DeleteStatus(status);

    return 0;
}
